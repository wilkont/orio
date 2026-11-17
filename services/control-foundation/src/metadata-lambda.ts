import {protocolResponse} from './protocol-api.ts';
import type {ProtocolReader} from './protocol-api.ts';
export interface MetadataLambdaResponse {statusCode:number;headers:Record<string,string>;body:string;isBase64Encoded:false}
const routes=new Set(['/health','/ready','/v1/protocol/policy','/v1/protocol/master']);
function object(value:unknown):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid HTTP event');
 return Object.fromEntries(Object.entries(value));
}
/** Public GET metadata only. Event fields cannot select credentials, SQL,
 * endpoints, financial capabilities or execution policy. No payload logging. */
export function createMetadataLambda(reader:Pick<ProtocolReader,'master'>,ensureQualified:()=>Promise<void>){
 return async(event:unknown):Promise<MetadataLambdaResponse>=>{
  const error=(statusCode:number,code:string):MetadataLambdaResponse=>({statusCode,
   headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(statusCode===405?{Allow:'GET'}:{})},
   body:JSON.stringify({error:code}),isBase64Encoded:false});
  let path:string,method:string;
  try{
   const e=object(event),http=object(object(e.requestContext).http);
   if(e.version!=='2.0'||typeof e.rawPath!=='string'||e.rawPath.length>256||!/^\/[\x21-\x7e]*$/.test(e.rawPath)||
    typeof http.method!=='string'||typeof e.rawQueryString!=='string'||e.rawQueryString.length>512||
    (e.body!==undefined&&e.body!==null&&e.body!=='')||(e.isBase64Encoded!==undefined&&e.isBase64Encoded!==false))throw new Error('Invalid HTTP event');
   path=e.rawPath;method=http.method;
  }catch{return error(400,'invalid_request');}
  if(method!=='GET')return error(405,'method_not_allowed');
  if(!routes.has(path))return error(404,'not_found');
  try{await ensureQualified();}catch{return error(503,'protocol_state_unavailable');}
  const result=await protocolResponse(reader,method,path);
  return {statusCode:result.status,headers:result.headers,body:JSON.stringify(result.body),isBase64Encoded:false};
 };
}
