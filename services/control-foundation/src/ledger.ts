import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export type Side = 'debit' | 'credit';
export interface Account { id: string; asset: string; normalSide: Side; allowNegative: boolean }
export interface Posting { accountId: string; side: Side; units: string }
export interface JournalRequest { idempotencyKey: string; externalRef: string; description: string; postings: Posting[] }
export interface Checkpoint { sequence: string; eventHash: string }
export interface Receipt extends Checkpoint { requestHash: string }
export interface Delivery { sequence: string; token: string; attempts: number; leasedUntil: Date; receipt: Receipt; request: JournalRequest }
interface JournalRow {
  sequence: string; idempotency_key: string; external_ref: string;
  request_hash: string; event_hash: string; payload: JournalRequest & { schemaVersion: number };
  account_snapshot: Account[];
  header: { sequence: string; previousHash: string; requestHash: string; recordedAt: string; accountsHash: string };
  request_text: string; header_text: string; accounts_text: string;
}
const digest = (text: string) => createHash('sha256').update(text,'utf8').digest('hex');
const zeroHash = '0'.repeat(64);
const receipt = (row: Pick<JournalRow,'sequence' | 'request_hash' | 'event_hash'>): Receipt =>
  ({ sequence: row.sequence, requestHash: row.request_hash, eventHash: row.event_hash });

/** Trusted service boundary. End-user authentication/ownership is the caller's responsibility. */
export class ControlLedger {
  private readonly pool: Pool;
  constructor(pool: Pool) { this.pool=pool; }

  async createAccount(account: Account): Promise<void> {
    await this.pool.query('SELECT orio_ledger.create_account($1,$2,$3,$4)',
      [account.id,account.asset,account.normalSide,account.allowNegative]);
  }

  async post(request: JournalRequest): Promise<Receipt> {
    const result = await this.pool.query<JournalRow>('SELECT * FROM orio_ledger.post_journal($1,$2,$3,$4::jsonb)',
      [request.idempotencyKey,request.externalRef,request.description,JSON.stringify(request.postings)]);
    if (!result.rows[0]) throw new Error('Missing journal receipt');
    return receipt(result.rows[0]);
  }

  async balances(): Promise<Array<Account & { units: string }>> {
    const result = await this.pool.query<{id:string;asset:string;normal_side:Side;allow_negative:boolean;units:string}>(
      'SELECT * FROM orio_ledger.balances ORDER BY id');
    return result.rows.map(r=>({id:r.id,asset:r.asset,normalSide:r.normal_side,allowNegative:r.allow_negative,units:r.units}));
  }

  async claim(limit: number, leaseSeconds: number): Promise<Delivery[]> {
    const result = await this.pool.query<JournalRow & {token:string;attempts:number;leased_until:Date}>(
      `SELECT j.*,o.token,o.attempts,o.leased_until FROM orio_ledger.claim_outbox($1,$2) o
       JOIN orio_ledger.journals j ON j.sequence=o.journal_sequence ORDER BY j.sequence`,[limit,leaseSeconds]);
    return result.rows.map(r=>({sequence:r.sequence,token:r.token,attempts:r.attempts,leasedUntil:r.leased_until,
      receipt:receipt(r),request:r.payload}));
  }

  async finish(sequence: string, token: string, success: boolean, retrySeconds=0): Promise<boolean> {
    const result = await this.pool.query<{accepted:boolean}>(
      'SELECT orio_ledger.finish_outbox($1,$2,$3,$4) AS accepted',[sequence,token,success,retrySeconds]);
    return result.rows[0]?.accepted === true;
  }

  /** Compare against a checkpoint retained outside this database to detect prefix rewrites. */
  async verify(checkpoint?: Checkpoint): Promise<{ok:boolean;issues:string[];head:Checkpoint}> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const journals = await client.query<JournalRow>(`SELECT *,payload::text AS request_text,
        header::text AS header_text,account_snapshot::text AS accounts_text FROM orio_ledger.journals ORDER BY sequence`);
      const postings = await client.query<{journal_sequence:string;account_id:string;side:Side;units:string}>(
        'SELECT * FROM orio_ledger.postings ORDER BY journal_sequence,account_id');
      const accounts = await client.query<{id:string;asset:string;normal_side:Side;allow_negative:boolean}>(
        'SELECT * FROM orio_ledger.accounts ORDER BY id');
      const heads = await client.query<{sequence:string;event_hash:string}>('SELECT * FROM orio_ledger.chain_head');
      const outbox = await client.query<{journal_sequence:string}>('SELECT journal_sequence FROM orio_ledger.outbox');
      await client.query('COMMIT');
      const issues: string[]=[];
      const accountMap = new Map(accounts.rows.map(a=>[a.id,a]));
      const byJournal = new Map<string,typeof postings.rows>();
      for (const p of postings.rows) {
        const list=byJournal.get(p.journal_sequence) ?? [];
        list.push(p); byJournal.set(p.journal_sequence,list);
      }
      const outboxSequences=new Set(outbox.rows.map(o=>o.journal_sequence));
      const journalSequences=new Set(journals.rows.map(j=>j.sequence));
      if (postings.rows.some(p=>!journalSequences.has(p.journal_sequence)) ||
          outbox.rows.some(o=>!journalSequences.has(o.journal_sequence))) issues.push('Orphan accounting or outbox record');
      const runningBalances = new Map<string,bigint>();
      let expected=1n;
      let previous=zeroHash;
      let checkpointSeen=checkpoint?.sequence==='0' && checkpoint.eventHash===zeroHash;
      for (const j of journals.rows) {
        try {
          if (j.sequence!==expected.toString() || j.header.sequence!==j.sequence || j.header.previousHash!==previous)
            issues.push(`Broken sequence/chain at ${j.sequence}`);
          if (digest(j.request_text)!==j.request_hash || j.header.requestHash!==j.request_hash || digest(j.header_text)!==j.event_hash)
            issues.push(`Hash mismatch at ${j.sequence}`);
          if (digest(j.accounts_text)!==j.header.accountsHash) issues.push(`Account snapshot hash mismatch at ${j.sequence}`);
          if (j.payload.schemaVersion!==1 || j.payload.idempotencyKey!==j.idempotency_key || j.payload.externalRef!==j.external_ref)
            issues.push(`Journal identity mismatch at ${j.sequence}`);
          const stored=byJournal.get(j.sequence) ?? [];
          const wanted=j.payload.postings;
          if (stored.length!==wanted.length || stored.some((p,i)=>
            p.account_id!==wanted[i]?.accountId || p.side!==wanted[i]?.side || p.units!==wanted[i]?.units))
            issues.push(`Posting mismatch at ${j.sequence}`);
          const sums=new Map<string,bigint>();
          for (const p of stored) {
            const a=accountMap.get(p.account_id);
            if (!a) throw new Error('Unknown account');
            if (!/^[1-9][0-9]{0,77}$/.test(p.units)) throw new Error('Invalid units');
            const units=BigInt(p.units);
            sums.set(a.asset,(sums.get(a.asset)??0n)+(p.side==='debit'?units:-units));
            const balance=(runningBalances.get(a.id)??0n)+(p.side===a.normal_side?units:-units);
            runningBalances.set(a.id,balance);
            if (!a.allow_negative && balance<0n) issues.push(`Negative protected balance at ${j.sequence}`);
          }
          if ([...sums.values()].some(n=>n!==0n)) issues.push(`Unbalanced journal at ${j.sequence}`);
          if (j.account_snapshot.length!==stored.length || j.account_snapshot.some((a,i)=>{
            const current=accountMap.get(a.id);
            return a.id!==stored[i]?.account_id || !current || current.asset!==a.asset || current.normal_side!==a.normalSide || current.allow_negative!==a.allowNegative;
          })) issues.push(`Account definition mismatch at ${j.sequence}`);
          if (!outboxSequences.has(j.sequence)) issues.push(`Missing outbox event at ${j.sequence}`);
          if (checkpoint?.sequence===j.sequence && checkpoint.eventHash===j.event_hash) checkpointSeen=true;
        } catch {
          issues.push(`Malformed accounting record at ${j.sequence}`);
        }
        previous=j.event_hash; expected++;
      }
      const head={sequence:(expected-1n).toString(),eventHash:previous};
      if (heads.rows.length!==1 || heads.rows[0]?.sequence!==head.sequence || heads.rows[0]?.event_hash!==head.eventHash)
        issues.push('Chain head mismatch');
      if (checkpoint && !checkpointSeen) issues.push('External checkpoint mismatch or missing');
      return {ok:issues.length===0,issues,head};
    } catch (error) {
      await client.query('ROLLBACK'); throw error;
    } finally { client.release(); }
  }
}
