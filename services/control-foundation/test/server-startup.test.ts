import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('service startup rejects unsafe connection configuration without echoing credentials', () => {
  const script = fileURLToPath(new URL('../src/server.ts', import.meta.url));
  for (const url of ['postgresql://user:fictional-private-value@[', 'postgresql://user:fictional-private-value@localhost/orio?ssl=no-verify']) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, ORIO_DATABASE_URL: url, ORIO_PG_CA_FILE: 'unused-test-ca' },
      encoding: 'utf8', timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.equal((result.stdout + result.stderr).includes('fictional-private-value'), false);
  }
});
