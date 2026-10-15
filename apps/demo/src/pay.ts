/**
 * Mode B from the command line: pay a wallet address (looked up in the ERC-6538 registry)
 * or a stealth ID directly. The agent makes the one-time address and announces it.
 *
 *   npm run pay -w @pansa/demo -- <0xaddress | st:arc:0x…> [amountUSDC]
 */
import { createPublicClient, createWalletClient, http, isAddress, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { decodeStealthMetaAddress } from '@pansa/core';
import { payRegisteredAccount, sendStealthPayment } from '@pansa/x402';
import { arcChain, requireEnv, txUrl, usdc } from './env.js';

const [to, amountArg = '0.01'] = process.argv.slice(2);
if (!to) {
  console.log('usage: npm run pay -w @pansa/demo -- <0xaddress | st:arc:0x…> [amountUSDC]');
  process.exit(1);
}

const account = privateKeyToAccount(requireEnv('AGENT_PRIVATE_KEY'));
const wallet = createWalletClient({ account, chain: arcChain, transport: http() });
const publicClient = createPublicClient({ chain: arcChain, transport: http() });
const amount = parseUnits(amountArg, 6);

const result = isAddress(to)
  ? await payRegisteredAccount({ wallet, publicClient, recipient: to, amount })
  : await sendStealthPayment({ wallet, publicClient, meta: decodeStealthMetaAddress(to), amount });

console.log(`Paid ${usdc(amount)} to one-time address ${result.stealthAddress}`);
console.log(`  transfer  ${txUrl(result.transferTx)}`);
console.log(`  announce  ${txUrl(result.announceTx)}`);
