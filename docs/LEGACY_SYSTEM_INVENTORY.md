# Legacy inventory — initial discovery

See EXECUTION_STATUS.md for repository revisions and access evidence. Source histories are preserved. The primary Node service contains Express routes for users, currencies, purchases, sales, NFT transactions, and conversion. Mongoose models include balances, holds, prices, and conversion records. Dependencies include MongoDB, MySQL, SQLite, AWS SDK, Coinbase, and Bitcoin tooling; dependency presence does not establish actual production use.

PHP API, Laravel website, and wallet/witness backup repositories are recovered for further assessment. AWS compute, storage, IAM, databases, backups, and logs remain unverified. DNS is AWS-hosted; mail routing must be preserved. Registrar, certificates, DNSSEC, and full zone inventory remain unverified.

## Follow-up discovery — November 3, 2026

The above paragraph describes the initial discovery state. Subsequent authenticated findings are recorded in INFRASTRUCTURE_DISCOVERY.md and below. All four repositories were fetched again successfully; their remote default-branch revisions remain unchanged from the recorded inventory. The backup working tree is recovered and clean after enabling repository-local Windows long-path support.

### Source architecture

- `orio`: Express service, default port 3083, MongoDB/Mongoose account and conversion records, cookie sessions and JWT authentication, Socket.IO, currency and NFT routes. The service mounts routes directly and does not demonstrate a reverse proxy or production perimeter.
- `orio-php-apis`: Laravel 7 dependency declaration, identity and account-recovery endpoints, medical/check-in functionality, delegate and metadata APIs. Only three default Laravel database migrations were present in the inspected migrations directory. A complete application database schema cannot be reconstructed from those migrations alone.
- `orio-website`: Laravel website pages and transaction explorer, with welcome/home, CBDC, DeFi, company, policy, FAQ, and authentication routes.
- `Orio-Backup`: Dagcoin headless-wallet dependency and witness implementations, including wallet buy/sell/send/burn routes, mobile signup/recovery and transfer handlers, and several historical variants. This is a DAG/witness-based legacy system, not a verified Base/EVM implementation. The wallet README describes server-side key storage; current deployed custody arrangements remain unverified.

No legacy application or wallet process was started locally. No production databases, private keys, or backup data were downloaded. Source files named `keys.json` exist under several devnet configuration paths; their live applicability is unknown and they must not be reused as production key material.

### Source-level authorization finding

`routes/sellOrioRouter.js` registers transaction listing and detail routes before `router.use(authenticate)`. Their implementations in `controllers/sellOrioController.js` query all transaction rows or select by a supplied transaction identifier without an owner filter. `app.js` mounts this router without an additional authentication middleware. This is evidence of application-level unauthenticated transaction disclosure in the inspected source, conditional on deployment and upstream controls. No live endpoint was probed and current external exposure is not established. The route requiring `req.user` is also registered before authentication and needs separate correction. Record the legacy behavior before changing it.
