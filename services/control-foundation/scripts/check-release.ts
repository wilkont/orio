import { readFile } from 'node:fs/promises';
import { evaluateRelease } from '../src/release.ts';

const paths=process.argv.slice(2);
if (paths.length!==3) {
  console.error('Usage: node scripts/check-release.ts deployment.json approvals.json trust-registry.json');
  process.exitCode=2;
} else {
  try {
    const [deployment,approvals,trust]=await Promise.all(paths.map(async path=>JSON.parse(await readFile(path,'utf8')) as unknown));
    const result=evaluateRelease(deployment,approvals,trust);
    console.log(JSON.stringify(result,null,2));
    process.exitCode=result.allowed?0:1;
  } catch {
    console.error('Release denied: unreadable or malformed release evidence'); process.exitCode=1;
  }
}
