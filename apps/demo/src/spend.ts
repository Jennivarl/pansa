/**
 * Spends straight from a one-time address. On Arc its USDC is also its gas, so it needs
 * no top-up from another wallet (which would link it to the seller).
 *
 *   npm run spend -w @pansapay/demo -- <to> [amountUSDC] [stealthAddress]
 */
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, isAddress, parseUnits, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_USDC, computeStealthPrivateKey } from '@pansapay/core';
import { JsonFilePaymentStore } from '@pansapay/x402/node';
import { arcChain, dataFile, requireEnv, txUrl, usdc } from './env.js';

const [to, amountArg, fromArg] = process.argv.slice(2);
if (!to || !isAddress(to)) {
  console.log('usage: npm run spend -w @pansapay/demo -- <to> [amountUSDC] [stealthAddress]');
  process.exit(1);
}

const keys = { spendingKey: requireEnv('SELLER_SPENDING_KEY'), viewingKey: requireEnv('SELLER_VIEWING_KEY') };
const client = createPublicClient({ chain: arcChain, transport: http() });
const balanceOf = (address: Hex) =>
  client.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] });

const payments = await new JsonFilePaymentStore(dataFile('payments')).list();
const candidates = fromArg ? payments.filter((p) => p.stealthAddress.toLowerCase() === fromArg.toLowerCase()) : payments;
let payment;
for (const p of candidates) if ((await balanceOf(p.stealthAddress)) > 0n) payment = p;
if (!payment) {
  console.log('No funded one-time address found.');
  process.exit(1);
}

const account = privateKeyToAccount(computeStealthPrivateKey(payment.ephemeralPublicKey, keys));
const wallet = createWalletClient({ account, chain: arcChain, transport: http() });
const before = await balanceOf(account.address);
const amount = amountArg ? parseUnits(amountArg, 6) : before / 2n;

console.log(`From one-time address ${account.address} (holds ${usdc(before)})`);
console.log(`Sending ${usdc(amount)} to ${to}; gas comes out of the same USDC balance.`);

const hash = await wallet.writeContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'transfer', args: [to, amount] });
const receipt = await client.waitForTransactionReceipt({ hash });
const after = await balanceOf(account.address);
const gasPaid = receipt.gasUsed * receipt.effectiveGasPrice; // native USDC, 18 decimals

console.log(`\n${receipt.status}: ${txUrl(hash)}`);
console.log(`Gas paid by the one-time address itself: $${formatUnits(gasPaid, 18)}`);
console.log(`Left on it: ${usdc(after)}  (${usdc(before)} - ${usdc(amount)} sent - gas)`);
