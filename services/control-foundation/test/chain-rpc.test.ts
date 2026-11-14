import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HttpsChainReader } from '../src/chain-rpc.ts';

test('transport emits only the selected read request with redirect and timeout protection', async () => {
  const client = new HttpsChainReader({
    sourceId: 'independent-provider', endpoint: 'https://rpc.example.invalid/private-api-path',
    headers: { Authorization: 'Bearer synthetic-test-credential' },
  }, async (url, init) => {
    assert.equal(url, 'https://rpc.example.invalid/private-api-path');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal instanceof AbortSignal);
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)),
      { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
    return Response.json({ jsonrpc: '2.0', id: 1, result: '0x2105' });
  });
  assert.equal(await client.request('eth_chainId', []), '0x2105');
});

test('rejects unsafe endpoints and unrecognized methods before sending any request', async () => {
  for (const endpoint of ['http://rpc.invalid', 'https://user:password@rpc.invalid', 'https://rpc.invalid/#fragment'])
    assert.throws(() => new HttpsChainReader({ sourceId: 'provider', endpoint }));
  let calls = 0;
  const client = new HttpsChainReader({ sourceId: 'provider', endpoint: 'https://rpc.invalid' },
    async () => { calls++; return Response.json({}); });
  for (const [method, params] of [
    ['eth_sendRawTransaction', ['signed-payload']],
    ['eth_getTransactionReceipt', ['wrong-hash']],
    ['eth_getBlockByNumber', ['pending', false]],
    ['eth_getBlockByNumber', ['0x01', false]],
  ] as const) {
    await assert.rejects(client.request(method as Parameters<HttpsChainReader['request']>[0], [...params]));
  }
  assert.equal(calls, 0);
});

test('rejects mismatched envelopes and provider errors without exposing their content', async () => {
  for (const body of [
    { jsonrpc: '2.0', id: 2, result: '0x1' },
    { jsonrpc: '2.0', id: 1, error: { message: 'synthetic-sensitive-message' } },
    { jsonrpc: '2.0', id: 1 },
    [{ jsonrpc: '2.0', id: 1, result: '0x1' }],
  ]) {
    const client = new HttpsChainReader({ sourceId: 'provider', endpoint: 'https://rpc.invalid' },
      async () => Response.json(body));
    await assert.rejects(client.request('eth_chainId', []), { message: 'Chain RPC request failed' });
  }
});

test('bounds response size and replaces network exceptions with a credential-safe error', async () => {
  const configuration = { sourceId: 'provider', endpoint: 'https://rpc.invalid/private-credential' };
  for (const implementation of [
    async () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    async () => { throw new Error('private-credential'); },
    async () => new Response('provider-details', { status: 500 }),
    async () => new Response('{malformed:json'),
  ]) {
    const client = new HttpsChainReader(configuration, implementation);
    await assert.rejects(client.request('eth_chainId', []), { message: 'Chain RPC request failed' });
  }
});

test('malformed credential headers are rejected without disclosing their contents', () => {
  assert.throws(() => new HttpsChainReader({
    sourceId: 'provider', endpoint: 'https://rpc.invalid',
    headers: { Authorization: 'Bearer synthetic-private-value\r\nInjected: true'.replaceAll('\\r\\n', '\r\n') },
  }), { message: 'Invalid chain RPC headers' });
});
