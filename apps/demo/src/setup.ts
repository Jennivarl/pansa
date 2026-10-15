/** Creates throwaway testnet keys in apps/demo/.env (gitignored). Never reuse these on mainnet. */
import { existsSync, writeFileSync } from 'node:fs';
import { generatePrivateKey, privateKeyToAddress } from 'viem/accounts';
import { encodeStealthMetaAddress, generateStealthKeys, getStealthMetaAddress } from '@pansa/core';
import { ARC_TESTNET } from '@pansa/core';
import { ENV_PATH, addressUrl } from './env.js';

if (existsSync(ENV_PATH)) {
  console.log(`${ENV_PATH} already exists — leaving it alone.`);
  process.exit(0);
}

const seller = generateStealthKeys();
const agentKey = generatePrivateKey();
const agent = privateKeyToAddress(agentKey);

writeFileSync(
  ENV_PATH,
  [
    '# PANSA demo — Arc TESTNET ONLY. Throwaway keys, do not fund with real money.',
    `SELLER_SPENDING_KEY=${seller.spendingKey}`,
    `SELLER_VIEWING_KEY=${seller.viewingKey}`,
    `AGENT_PRIVATE_KEY=${agentKey}`,
    '# CIRCLE_API_KEY=   # optional: production auth; without it the keyless trial is used',
    '',
  ].join('\n'),
);

console.log(`Wrote ${ENV_PATH}

Seller stealth ID: ${encodeStealthMetaAddress(getStealthMetaAddress(seller))}

Agent wallet:      ${agent}
  1. Open ${ARC_TESTNET.faucetUrl}, pick Arc Testnet, paste the address above.
  2. Check it: ${addressUrl(agent)}
`);
