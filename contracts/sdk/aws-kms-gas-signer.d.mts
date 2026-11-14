export function publicAddress(response:unknown,keyArn:string):string;
export function derSignature(input:Uint8Array):{r:string;s:string};
export function createKmsGasSigner(transport:{request(method:'GetPublicKey'|'Sign',input:Record<string,unknown>):Promise<unknown>},
 inputPolicy:{keyArn:string;chainId:string;signer:string;paymaster:string}):Promise<{
  signTypedData(domain:unknown,types:unknown,value:unknown):Promise<string>;
 }>;
