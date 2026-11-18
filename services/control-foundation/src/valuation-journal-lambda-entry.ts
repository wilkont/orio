import {readFile} from 'node:fs/promises';
import {createValuationJournalIamPool,valuationJournalUser} from './valuation-journal-iam.ts';
import {ValuationRuntimeJournal} from './valuation-runtime-journal.ts';
import {createValuationJournalLambda} from './valuation-journal-lambda.ts';
const ca=await readFile(new URL('../config/rds-ca.pem',import.meta.url));
const pool=createValuationJournalIamPool(process.env,ca);
export const handler=createValuationJournalLambda(new ValuationRuntimeJournal(pool,{database:'orio_control',login:valuationJournalUser}));
