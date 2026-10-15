/**
 * Creates demo keys in apps/demo/.env (testnet) or apps/demo/.env.mainnet (`-- mainnet`).
 * Both are gitignored. Mainnet keys are hot keys: fund them with pocket change only.
 */
import { existsSync, writeFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import { ARC_MAINNET, ARC_TESTNET, encodeStealthMetaAddress, generateStealthKeys, getStealthMetaAddress } from '@pansapay/core';
import { ENV_PATH } from './env.js';

const mainnet = process.argv[2] === 'mainnet';
const path = mainnet ? `${ENV_PATH}.mainnet` : ENV_PATH;
const net = mainnet ? ARC_MAINNET : ARC_TESTNET;

if (existsSync(path)) {
  console.log(`${path} already exists — leaving it alone.`);
  process.exit(0);
}

const seller = generateStealthKeys();
const agentKey = generatePrivateKey();
const agent = privateKeyToAddress(agentKey);

writeFileSync(
  path,
  [
    mainnet
      ? '# PANSA demo — Arc MAINNET hot keys. Fund the agent with pocket change only.'
      : '# PANSA demo — Arc TESTNET ONLY. Throwaway keys, do not fund with real money.',
    ...(mainnet ? ['ARC_NETWORK=mainnet'] : []),
    `SELLER_SPENDING_KEY=${seller.spendingKey}`,
    `SELLER_VIEWING_KEY=${seller.viewingKey}`,
    `AGENT_PRIVATE_KEY=${agentKey}`,
    '# CIRCLE_API_KEY=   # optional: production auth; without it the keyless trial is used',
    '',
  ].join('\n'),
);

console.log(`Wrote ${path}

Seller stealth ID: ${encodeStealthMetaAddress(getStealthMetaAddress(seller))}

Agent wallet (${net.name}): ${agent}
  ${mainnet ? 'Send it a little USDC on Arc mainnet.' : 'Fund it at https://faucet.circle.com (Arc Testnet).'}
  ${net.explorerUrl}/address/${agent}
`);
