/** An agent that buys from the demo API with private payments. */
import { createPublicClient, erc20Abi, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC_USDC } from '@pansa/core';
import { createPayingFetch } from '@pansa/x402';
import { API_URL, NET, addressUrl, arcChain, requireEnv, txUrl, usdc } from './env.js';

const account = privateKeyToAccount(requireEnv('AGENT_PRIVATE_KEY'));
const client = createPublicClient({ chain: arcChain, transport: http() });
const balance = () =>
  client.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [account.address] });

const payingFetch = createPayingFetch({
  account,
  networks: [NET.caip2],
  maxAmount: 100_000n, // never more than $0.10 per call
  onPayment: ({ requirements, settlement }) => {
    console.log(`  paid ${usdc(requirements.amount)} to one-time address ${requirements.payTo}`);
    if (settlement?.transaction) console.log(`  ${txUrl(settlement.transaction)}`);
  },
});

console.log(`Agent ${account.address}\n${addressUrl(account.address)}`);
const before = await balance();
console.log(`USDC before: ${usdc(before)}\n`);
if (before === 0n) {
  console.log('No USDC yet. Testnet USDC: https://faucet.circle.com');
  process.exit(1);
}

for (const path of ['/api/weather', '/api/news', '/api/signals']) {
  console.log(`GET ${path}`);
  const res = await payingFetch(`${API_URL}${path}`);
  console.log(`  ${res.status}`, res.ok ? await res.json() : await res.text(), '\n');
}

const after = await balance();
console.log(`USDC after:  ${usdc(after)}  (spent ${usdc(before - after)})`);
console.log('\nOn the explorer: three payments to three unrelated addresses. Nothing points to the seller.');
