import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { providerEnvironment, startProviderSession } from '../scripts/provider-session.mjs';

const values = { alchemy: 'a'.repeat(32), infura: 'b'.repeat(32), pimlico: 'pim_' + 'c'.repeat(32) };
test('credentials can only form fixed testnet vendor URLs', () => {
  const env = providerEnvironment(values);
  assert.equal(new URL(env.ORIO_RPC_PRIMARY_URL).hostname, 'base-sepolia.g.alchemy.com');
  assert.equal(new URL(env.ORIO_RPC_SECONDARY_URL).hostname, 'base-sepolia.infura.io');
  assert.equal(new URL(env.ORIO_BUNDLER_URL).pathname, '/v2/84532/rpc');
  for (const bad of ['', 'https://evil.invalid', 'x'.repeat(257), 'a'.repeat(16) + '\n'])
    assert.throws(() => providerEnvironment({ ...values, alchemy: bad }));
});
test('local credential session rejects cross-origin, replay and malformed inputs without exposing keys', async () => {
  let calls = 0;
  const session = await startProviderSession(async supplied => {
    assert.deepEqual(supplied, values); calls++;
    return { status: 'READ_ONLY_TEST', financialExecutionEnabled: false };
  });
  try {
    const origin = new URL(session.url).origin;
    const post = (body, headers = {}) => fetch(session.url, { method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin, ...headers }, body });
    const page = await fetch(session.url);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.equal(page.headers.get('referrer-policy'), 'same-origin');
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await page.text(), /type="password"/);
    assert.equal((await fetch(origin + '/wrong')).status, 403);
    assert.equal((await post(new URLSearchParams(values), { origin: 'https://evil.invalid' })).status, 403);
    assert.equal((await post(new URLSearchParams(values), { origin: 'null' })).status, 403);
    assert.equal((await post(new URLSearchParams(values), { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await post(new URLSearchParams({ ...values, extra: 'x' }))).status, 400);
    assert.equal((await post('x'.repeat(4097))).status, 413);
    assert.equal(calls, 0);
    assert.equal((await post(new URLSearchParams(values))).status, 303);
    assert.equal(calls, 1);
    assert.equal((await post(new URLSearchParams(values))).status, 403);
    const result = await (await fetch(session.url)).text();
    assert.match(result, /READ_ONLY_TEST/);
    for (const key of Object.values(values)) assert.ok(!result.includes(key));
  } finally { session.close(); }
});
test('provider failures return a generic result, never credential-bearing exceptions', async () => {
  const session = await startProviderSession(async () => { throw new Error(values.alchemy); });
  try {
    await fetch(session.url, { method: 'POST', headers: {
      'content-type': 'application/x-www-form-urlencoded', origin: new URL(session.url).origin,
    }, body: new URLSearchParams(values) });
    const result = await (await fetch(session.url)).text();
    assert.match(result, /BLOCKED/);
    assert.ok(!result.includes(values.alchemy));
  } finally { session.close(); }
});
test('overlapping request bodies cannot qualify twice', async () => {
  let calls = 0;
  const session = await startProviderSession(async () => { calls++; return { status: 'TEST' }; });
  try {
    const body = new URLSearchParams(values).toString();
    const pending = [0, 1].map(() => {
      let client;
      const done = new Promise((resolve, reject) => {
        client = request(session.url, { method: 'POST', headers: {
          origin: new URL(session.url).origin, 'content-type': 'application/x-www-form-urlencoded',
        } }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
        client.on('error', reject); client.write(body.slice(0, -1));
      });
      return { client, done };
    });
    await new Promise(resolve => setTimeout(resolve, 25));
    for (const item of pending) item.client.end(body.slice(-1));
    assert.deepEqual((await Promise.all(pending.map(item => item.done))).sort(), [303, 403]);
    assert.equal(calls, 1);
  } finally { session.close(); }
});
