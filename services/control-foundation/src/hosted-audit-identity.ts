export const auditSecretArn='arn:aws:secretsmanager:us-east-1:720232346199:secret:rds!db-1bf19966-f3d1-41b1-8bbb-f3091801fe5f-IOWCi7';
/** Returns a sensitive in-memory URL. Never log, persist or pass to a child. */
export function auditConnection(response:unknown):string{
 if(response===null||typeof response!=='object'||!('ARN' in response)||response.ARN!==auditSecretArn||!('SecretString' in response)||typeof response.SecretString!=='string')throw new Error('Wrong secret identity');
 let secret:unknown;try{secret=JSON.parse(response.SecretString);}catch{throw new Error('Invalid maintenance identity');}
 if(secret===null||typeof secret!=='object'||!('username' in secret)||secret.username!=='orio_ledger_admin'||!('password' in secret)||typeof secret.password!=='string'||secret.password.length<1)throw new Error('Invalid maintenance identity');
 const connection=new URL('postgresql://orio-spc-3-ledger-ledgerdatabase-sdrgecp35snc.cpa8oeo62tiq.us-east-1.rds.amazonaws.com:5432/orio_control');
 connection.username=secret.username;connection.password=encodeURIComponent(secret.password);return connection.href;
}
