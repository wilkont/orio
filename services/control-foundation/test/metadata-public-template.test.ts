import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('prepared public gateway permits only the four fixed GET metadata routes on the existing function',async()=>{
 const text=await readFile(new URL('../../../infrastructure/aws/metadata-public-api.json',import.meta.url),'utf8');
 const template=JSON.parse(text),resources=template.Resources;
 assert.equal(Object.keys(resources).length,11);
 const paths=['/health','/ready','/v1/protocol/policy','/v1/protocol/master'];
 const routes=Object.values<{Type:string;Properties:{RouteKey:string}}>(resources).filter(r=>r.Type==='AWS::ApiGatewayV2::Route');
 assert.deepEqual(routes.map(r=>r.Properties.RouteKey).sort(),paths.map(p=>'GET '+p).sort());
 const permissions=Object.values<{Type:string;Properties:{FunctionName:string;Action:string;Principal:string;SourceAccount:string;SourceArn:{'Fn::Sub':string}}}>(resources).filter(r=>r.Type==='AWS::Lambda::Permission');
 assert.equal(permissions.length,4);
 for(const p of permissions){
  assert.equal(p.Properties.FunctionName,'arn:aws:lambda:us-east-1:720232346199:function:orio-spc-3-protocol-metadata');
  assert.equal(p.Properties.Action,'lambda:InvokeFunction');assert.equal(p.Properties.Principal,'apigateway.amazonaws.com');assert.equal(p.Properties.SourceAccount,'720232346199');
 }
 assert.deepEqual(permissions.map(p=>p.Properties.SourceArn['Fn::Sub']).sort(),paths.map(p=>'arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:${MetadataApi}/*/GET'+p).sort());
 assert.equal(resources.MetadataIntegration.Properties.PayloadFormatVersion,'2.0');assert.equal(resources.MetadataIntegration.Properties.TimeoutInMillis,10000);
 for(const forbidden of ['AWS::IAM::','AWS::RDS::','AWS::EC2::','AWS::Lambda::Function','AWS::Lambda::Url','secretsmanager:','kms:','ANY ','{proxy+}'])assert.equal(text.includes(forbidden),false);
});
test('public metadata preparation bounds backend traffic and excludes request payload logging',async()=>{
 const t=JSON.parse(await readFile(new URL('../../../infrastructure/aws/metadata-public-api.json',import.meta.url),'utf8')),r=t.Resources;
 assert.deepEqual(r.MetadataApi.Properties.CorsConfiguration.AllowOrigins,['https://orio.io','https://www.orio.io']);
 assert.deepEqual(r.MetadataApi.Properties.CorsConfiguration.AllowMethods,['GET']);assert.equal(r.MetadataApi.Properties.CorsConfiguration.AllowCredentials,false);
 assert.deepEqual(r.MetadataStage.Properties.DefaultRouteSettings,{ThrottlingBurstLimit:2,ThrottlingRateLimit:1,DetailedMetricsEnabled:false});
 assert.equal(r.MetadataStage.Properties.AccessLogSettings,undefined);
 assert.equal(r.MetadataStage.DependsOn.length,8);
 for(const name of r.MetadataStage.DependsOn)assert.ok(name.endsWith('Route')||name.endsWith('Permission'));
 for(const resource of Object.values<{Condition:string}>(r))assert.equal(resource.Condition,'Target');
});
