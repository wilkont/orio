import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { configuredChainProviders, qualifyChainProviders } from '../src/provider-qualification.ts';
import { configuredBundler, qualifyBundler } from '../src/bundler-qualification.ts';

// Ephemeral qualification only: credentials never go to disk, argv, environment or logs.
// Only these three fixed vendor destinations and Base Sepolia are reachable by this tool.
export function providerEnvironment(values) {
  const entries = ['alchemy', 'infura', 'pimlico'];
  for (const name of entries) {
    if (typeof values[name] !== 'string' || !/^[A-Za-z0-9_-]{16,256}$/.test(values[name]))
      throw new Error('Invalid provider credentials');
  }
  return {
    ORIO_RPC_PRIMARY_OPERATOR_ID: 'alchemy',
    ORIO_RPC_PRIMARY_URL: 'https://base-sepolia.g.alchemy.com/v2/' + values.alchemy,
    ORIO_RPC_SECONDARY_OPERATOR_ID: 'infura',
    ORIO_RPC_SECONDARY_URL: 'https://base-sepolia.infura.io/v3/' + values.infura,
    ORIO_BUNDLER_URL: 'https://api.pimlico.io/v2/84532/rpc?apikey=' + values.pimlico,
  };
}

export async function probeCredentials(values) {
  const env = providerEnvironment(values), now = new Date().toISOString();
  const providers = configuredChainProviders(env);
  // Each result remains useful when another vendor is unavailable. Never report vendor errors.
  const checks = await Promise.allSettled([
    qualifyChainProviders(providers.first, providers.second, {
      chainId: '84532', maximumFinalizedAgeSeconds: '3600', maximumHeightSkew: '128',
    }, now),
    qualifyBundler(configuredBundler(env), {
      chainId: '84532', entryPointAddress: '0x4337084d9e255ff0702461cf8895ce9e3b5ff108', entryPointVersion: '0.8',
    }, now),
  ]);
  return {
    financialExecutionEnabled: false, observedAt: now,
    checks: checks.map((result, i) => result.status === 'fulfilled' ? result.value : {
      status: 'BLOCKED', role: i === 0 ? 'independent-chain-readers' : 'bundler-capability',
      reason: 'Provider configuration or read-only checks failed',
    }),
  };
}

export async function startProviderSession(probe = probeCredentials) {
  const token = randomBytes(32).toString('hex');
  let origin, used = false, result;
  const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Chromium suppresses POST Origin under no-referrer. Same-origin preserves our
    // strict origin check while sending no referrer to external destinations.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    const deny = (status = 403, reason = 'request-policy') => { res.writeHead(status); res.end('Request rejected: ' + reason); };
    if (req.headers.host !== new URL(origin).host || req.method !== 'GET' && req.headers['sec-fetch-site'] === 'cross-site') return deny();
    if (req.method === 'GET' && req.url === '/' + token) {
      res.end('<!doctype html><title>ORIO test-network qualification</title><h1>ORIO test-network qualification</h1>' +
        '<p>Memory-only credentials. No files, payments, signing, or transactions. Checks use Base Sepolia only.</p>' +
        (result ? '<pre>' + escape(JSON.stringify(result, null, 2)) + '</pre>' : used ? '<p>Checks are running.</p>' :
          '<form method="post" action="/' + token + '">' +
          ['alchemy', 'infura', 'pimlico'].map(name => '<p><label>' + name +
            ' key <input type="password" autocomplete="off" required name="' + name + '"></label></p>').join('') +
          '<button>Run read-only test-network checks</button></form>'));
      return;
    }
    if (req.method !== 'POST' || req.url !== '/' + token || used) return deny();
    if (req.headers.origin !== origin) return deny(403, 'origin-policy');
    if (req.headers['content-type'] !== 'application/x-www-form-urlencoded') return deny(403, 'content-type-policy');
    const chunks = []; let size = 0;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4096) { deny(413); return; }
        chunks.push(chunk);
      }
      const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      if (fields.size !== 3 || ['alchemy', 'infura', 'pimlico'].some(name => fields.getAll(name).length !== 1)) return deny(400);
      const values = Object.fromEntries(fields);
      providerEnvironment(values);
      if (used) return deny(); // Recheck after body awaits: concurrent submissions must not run twice.
      used = true;
      try { result = await probe(values); }
      catch { result = { status: 'BLOCKED', financialExecutionEnabled: false, reason: 'Read-only qualification failed' }; }
      res.writeHead(303, { Location: '/' + token }); res.end();
    } catch { deny(400, 'input-policy'); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  const expiry = setTimeout(() => { server.closeAllConnections(); server.close(); }, 10 * 60 * 1000);
  expiry.unref();
  return { url: origin + '/' + token, server, close: () => { clearTimeout(expiry); server.closeAllConnections(); server.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const session = await startProviderSession();
  console.log('Open the private local session: ' + session.url);
  setTimeout(session.close, 10 * 60 * 1000).unref();
}
