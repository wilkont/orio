import {qualificationTarget} from './restore-qualification-target.ts';
export const qualificationTemplateSha256='5c83dccbd47230a8ef56d9ffe48e04ff2a42857ca622fc9c4defda8d9c8a63e5';
export const observedHostedBaseline='8374196a216470ba79eb63c908ed801d8b0b04ba9a19859ae08919ca58a4f09d';
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid qualification context');
 return Object.fromEntries(Object.entries(value));
}
/** Validates a fresh, checksum-pinned context captured from authenticated AWS
 * metadata. No access is granted; a privileged operator can forge metadata and
 * must not be treated as an independent attestor. Network policy is also pinned.
 */
export function qualificationSession(value:unknown,now=new Date()){
 const context=object(value),observed=typeof context.observedAt==='string'?Date.parse(context.observedAt):NaN;
 if(context.version!==1||context.account!=='720232346199'||context.region!=='us-east-1'||context.templateSha256!==qualificationTemplateSha256||
  typeof context.stackArn!=='string'||!/^arn:aws:cloudformation:us-east-1:720232346199:stack\/orio-spc-3-sql-qualification\/[a-f0-9-]{36}$/.test(context.stackArn)||
  !Number.isFinite(observed)||!Number.isFinite(now.getTime())||observed>now.getTime()+30000||now.getTime()-observed>3600000||typeof context.maintenanceSecurityGroupId!=='string')throw new Error('Stale or unreviewed qualification context');
 const target=qualificationTarget(context.instance,context.snapshot,context.cloneSecurityGroup,context.maintenanceSecurityGroupId);
 return Object.freeze({target:Object.freeze(target),baselineFingerprint:observedHostedBaseline});
}
/** Sensitive return value: keep in memory and pass only to the pinned RDS client. */
export function qualificationPassword(response:unknown,expectedArn:string):string{
 const outer=object(response);
 if(outer.ARN!==expectedArn||typeof outer.SecretString!=='string')throw new Error('Wrong qualification secret');
 let secret:Record<string,unknown>;try{secret=object(JSON.parse(outer.SecretString));}catch{throw new Error('Invalid qualification secret');}
 if(secret.username!=='orio_ledger_admin'||typeof secret.password!=='string'||secret.password.length<1||secret.password.length>4096)throw new Error('Invalid qualification identity');
 return secret.password;
}
