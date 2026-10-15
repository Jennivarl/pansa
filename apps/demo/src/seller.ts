/** Seller's private view: every one-time address it was paid at, and what each holds now. */
import { createPublicClient, erc20Abi, http } from 'viem';
import { privateKeyToAddress } from 'viem/accounts';
import { ARC_USDC, computeStealthPrivateKey } from '@pansa/core';
import { JsonFilePaymentStore } from '@pansa/x402/node';
import { addressUrl, arcChain, dataFile, requireEnv, usdc } from './env.js';

const keys = { spendingKey: requireEnv('SELLER_SPENDING_KEY'), viewingKey: requireEnv('SELLER_VIEWING_KEY') };
const client = createPublicClient({ chain: arcChain, transport: http() });
const payments = await new JsonFilePaymentStore(dataFile('payments')).list();

if (payments.length === 0) {
  console.log('No payments yet. Run the API and the agent first.');
  process.exit(0);
}

let total = 0n;
for (const p of payments) {
  const held = await client.readContract({
    address: ARC_USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [p.stealthAddress],
  });
  // Proves we can spend it: the derived key controls this address.
  const canSpend = privateKeyToAddress(computeStealthPrivateKey(p.ephemeralPublicKey, keys)) === p.stealthAddress;
  total += held;
  console.log(`${p.receivedAt}  ${usdc(p.amount).padEnd(10)} ${p.resource}`);
  console.log(`  ${addressUrl(p.stealthAddress)}  holds ${usdc(held)}  ${canSpend ? 'spendable' : 'KEY MISMATCH'}`);
}
console.log(`\n${payments.length} payments, ${usdc(total)} held across ${payments.length} one-time addresses.`);
