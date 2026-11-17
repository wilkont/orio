import {readFile} from 'node:fs/promises';
import {ProtocolReader} from './protocol-api.ts';
import {createMetadataLambda} from './metadata-lambda.ts';
import {createMetadataIamPool} from './metadata-iam.ts';
const ca=await readFile(new URL('../config/rds-ca.pem',import.meta.url));
const {pool,ensureQualified}=createMetadataIamPool(process.env,ca);
export const handler=createMetadataLambda(new ProtocolReader(pool),ensureQualified);
