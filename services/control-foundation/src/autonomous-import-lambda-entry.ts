import {readFile} from 'node:fs/promises';
import {createQualificationAutonomousImporter} from './autonomous-import-runtime.ts';

const ca=await readFile(new URL('../config/rds-ca.pem',import.meta.url));
export const handler=createQualificationAutonomousImporter(process.env,ca);
