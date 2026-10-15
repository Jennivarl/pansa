/**
 * Live check against Circle's Facilitator, with nothing at stake: pays from a brand-new
 * empty wallet. "insufficient_funds" means Circle accepted our seller proof and stealth
 * payTo; a 401/400 means it did not.
 */
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { computeStealthPrivateKey, getStealthMetaAddress } from '@pansapay/core';
import { CircleFacilitator, FacilitatorError, StealthSeller, X402_VERSION, signExactPayment } from '@pansapay/x402';
import { NET, requireEnv } from './env.js';

const keys = { spendingKey: requireEnv('SELLER_SPENDING_KEY'), viewingKey: requireEnv('SELLER_VIEWING_KEY') };
const facilitator = new CircleFacilitator({ apiKey: process.env.CIRCLE_API_KEY });
const seller = new StealthSeller({
  meta: getStealthMetaAddress(keys),
  viewingKey: keys.viewingKey,
  spendingKey: keys.spendingKey,
  network: NET.caip2,
  facilitator,
});

const emptyWallet = privateKeyToAccount(generatePrivateKey());
const requirements = seller.requirements({ amount: 10_000n, resource: { url: 'https://pansa.local/check' } });
const payload = await signExactPayment(emptyWallet, requirements);

console.log(`payTo (one-time): ${requirements.payTo}`);
try {
  const res = await facilitator.settle(
    {
      x402Version: X402_VERSION,
      paymentPayload: { x402Version: X402_VERSION, accepted: requirements, payload },
      paymentRequirements: requirements,
    },
    { payToPrivateKey: computeStealthPrivateKey(requirements.extra!.pansa!.ephemeralPublicKey, keys) },
  );
  console.log('Circle replied:', res);
} catch (err) {
  if (err instanceof FacilitatorError) console.log('Circle rejected:', err.status, err.code, err.message);
  else throw err;
}
