import assert from 'node:assert/strict';
import { AbiCoder, Interface, Wallet, keccak256, toUtf8Bytes } from 'ethers';
import { bytesToHex } from '@ethereumjs/util';
import { compileContracts } from '../../scripts/compile.mjs';
import { createFixture } from './vm.mjs';
import { initialMonetaryState, usdScale } from '../../../services/control-foundation/src/monetary-engine.ts';

export const artifacts = compileContracts(true);
export const hash = value => keccak256(toUtf8Bytes(value));
export async function monetaryFixture(shared) {
  const f = shared ?? await createFixture(artifacts, 84532);
  const registry = await f.deploy('src/MasterAssetRegistry.sol', 'MasterAssetRegistry', [f.authority.address]);
  const master = await f.deploy('test/MonetaryFixtures.sol', 'MockMasterToken', [6]);
  const valuer = new Wallet(bytesToHex(f.key)), second = new Wallet(bytesToHex(f.outsiderKey));
  const assetId = async token => (await f.read(registry, 'assetId', [token.address]))[0];
  async function approveAsset(token) {
    assert.equal((await f.govern(registry, 'registerCandidate', [token.address, 6, hash('policy')])).execResult.exceptionError, undefined);
    assert.equal((await f.govern(registry, 'approveAsset', [await assetId(token), hash('eligibility')])).execResult.exceptionError, undefined);
  }
  await approveAsset(master);
  assert.equal((await f.govern(registry, 'electInitial', [await assetId(master), hash('initial-election')])).execResult.exceptionError, undefined);
  const controller = await f.deploy('src/ORIOMonetaryController.sol', 'ORIOMonetaryController', [f.authority.address, registry.address, master.address]);
  const currency = { address: (await f.read(controller, 'currency'))[0], api: new Interface(artifacts['src/ORIOCurrency.sol'].ORIOCurrency.abi) };
  const vault = { address: (await f.read(controller, 'vault'))[0], api: new Interface(artifacts['src/ORIOReserveVault.sol'].ORIOReserveVault.abi) };
  const locks = { address: (await f.read(controller, 'redemptionLocks'))[0], api: new Interface(artifacts['src/ORIORedemptionLocks.sol'].ORIORedemptionLocks.abi) };
  assert.equal((await f.govern(registry, 'bindMonetarySettlement', [controller.address, vault.address])).execResult.exceptionError, undefined);
  assert.equal((await f.govern(controller, 'configure', [valuer.address, f.sender, true, 0])).execResult.exceptionError, undefined);
  for (const [address, key] of [[f.sender, f.key], [second.address, f.outsiderKey]]) {
    assert.equal((await f.call(master, 'mintFixture', [address, 10n ** 15n])).execResult.exceptionError, undefined);
    assert.equal((await f.call(master, 'approve', [vault.address, 10n ** 15n], key)).execResult.exceptionError, undefined);
  }
  async function valuation(asset = master.address, usd36 = usdScale, issuanceAllowed = true) {
    const value = { asset, usd36PerToken: usd36, registryEpoch: (await f.read(registry, 'epoch'))[0],
      registryRevision: (await f.read(registry, 'revision'))[0], controllerRevision: (await f.read(controller, 'revision'))[0],
      validAfter: f.time() - 1n, validUntil: f.time() + 120n, issuanceAllowed, evidenceDigest: hash('valuation') };
    return { value, signature: valuer.signingKey.sign((await f.read(controller, 'valuationHash', [value]))[0]).serialized };
  }
  const phases = ['GENESIS','ACTIVE','ZERO_SUPPLY_PENDING','ZERO_SUPPLY_RECONCILED'];
  async function state() {
    const token = (await f.read(vault, 'masterAsset'))[0].toLowerCase();
    let numerator = (await f.read(controller, 'roundingUsd54'))[0], denominator = 10n ** 18n;
    let a = numerator, b = denominator; while (b) [a,b] = [b,a%b]; numerator /= a; denominator /= a;
    return { ...initialMonetaryState('erc20:84532:' + token, 'onchain-epoch:' + (await f.read(registry, 'epoch'))[0]),
      supplyAtoms: (await f.read(currency, 'totalSupply'))[0].toString(), reserveMasterUnits: (await f.read(vault, 'reserveUnits'))[0].toString(),
      priceUsd36: { numerator: (await f.read(controller, 'referencePriceUsd36'))[0].toString(), denominator: '1' },
      roundingUsd36: { numerator: numerator.toString(), denominator: denominator.toString() },
      cycle: (await f.read(controller, 'cycle'))[0].toString(), phase: phases[Number((await f.read(controller, 'phase'))[0])] };
  }
  function engineValuation(snapshot, value) {
    return { masterAssetId: snapshot.masterAssetId, electionId: snapshot.electionId, usd36PerToken: value.usd36PerToken.toString(),
      evidenceDigest: value.evidenceDigest.slice(2), observedAt: new Date(Number(value.validAfter) * 1000).toISOString(),
      expiresAt: new Date(Number(value.validUntil) * 1000).toISOString(), issuanceAllowed: value.issuanceAllowed };
  }
  let nextEpoch = 0;
  async function seal(requests, id = hash('epoch-' + nextEpoch++)) {
    const prepared = requests.map((r,i) => ({ requestId: r.requestId ?? hash('request-' + id + '-' + i), sequence: BigInt(i + 1), owner: r.owner ?? f.sender, recipient: r.recipient ?? r.owner ?? f.sender,
      atoms: r.atoms, minimumPayout: r.minimumPayout ?? 1n, nonce: r.nonce ?? BigInt(nextEpoch * 100 + i), deadline: f.time() + 60n, signature: '0x' }));
    const commitment = (await f.read(controller, 'redemptionCommitment', [prepared]))[0];
    const result = await f.call(controller, 'sealRedemptionEpoch', [id, (await f.read(controller, 'stateVersion'))[0], commitment, f.time() + 60n]);
    assert.equal(result.execResult.exceptionError, undefined);
    for (const r of prepared) r.signature = (r.owner.toLowerCase() === f.sender.toLowerCase() ? valuer : second)
      .signingKey.sign((await f.read(controller, 'redemptionHash', [r]))[0]).serialized;
    for (const r of prepared) assert.equal((await f.call(locks, 'lockRedemption', [r])).execResult.exceptionError, undefined);
    return { id, requests: prepared };
  }
  return { ...f, registry, master, controller, currency, vault, locks, valuer, second, valuation, state, engineValuation, seal, approveAsset, assetId,
    now: () => new Date(Number(f.time()) * 1000).toISOString(),
    decodeCheckpoint: result => {
      const event = f.logs(result, controller).find(event => event?.name === 'MonetaryCheckpoint');
      return { event, data: AbiCoder.defaultAbiCoder().decode(['uint256','address','uint256','uint256','uint256','uint256','uint256','uint256','uint8','bytes32','uint256','uint256','uint256','uint64','bytes32'], event.args.stateData) };
    } };
}
