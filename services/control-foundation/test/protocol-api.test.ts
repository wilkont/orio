import assert from 'node:assert/strict';
import { test } from 'node:test';
import { once } from 'node:events';
import { createProtocolServer } from '../src/protocol-api.ts';
import type { MasterStatus } from '../src/protocol-api.ts';

const paused: MasterStatus = { electionId: null, state: 'DEPOSIT_PAUSED', asset: null };

test('reports the recorded empty/paused master without electing the configured USDC selection', async () => {
  const server = createProtocolServer({ master: async () => paused });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing local test port');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const response = await fetch(base + '/v1/protocol/master');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { master: paused, financialExecutionEnabled: false });
    assert.equal((await fetch(base + '/ready')).status, 200);
    assert.equal((await fetch(base + '/v1/protocol/master', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/v1/wallets')).status, 404);
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('returns a generic unavailable response when the registry cannot be read', async () => {
  const server = createProtocolServer({ master: async () => { throw new Error('private-connection-details'); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Missing local test port');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    const response = await fetch(base + '/ready');
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'protocol_state_unavailable' });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
