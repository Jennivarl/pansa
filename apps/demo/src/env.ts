import { fileURLToPath } from 'node:url';
import { defineChain, type Hex } from 'viem';
import { ARC_MAINNET, ARC_TESTNET } from '@pansa/core';

export const ENV_PATH = fileURLToPath(new URL('../.env', import.meta.url));

try {
  // ARC_NETWORK=mainnet in the shell picks the mainnet key file.
  process.loadEnvFile(process.env.ARC_NETWORK === 'mainnet' ? `${ENV_PATH}.mainnet` : ENV_PATH);
} catch {
  // no .env file: rely on the real environment (or run `npm run setup -w @pansa/demo`)
}

/** Point at a persistent volume in production. */
export const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url));
export const WEB_DIST = process.env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist/', import.meta.url));

export function requireEnv(name: string): Hex {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing — run: npm run setup -w @pansa/demo`);
  return value as Hex;
}

export const IS_MAINNET = process.env.ARC_NETWORK === 'mainnet';
export const NET = IS_MAINNET ? ARC_MAINNET : ARC_TESTNET;

export const API_PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 4021);
export const API_URL = process.env.API_URL ?? `http://localhost:${API_PORT}`;

export const arcChain = defineChain({
  id: NET.id,
  name: NET.name,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ARC_RPC_URL ?? NET.rpcUrl] } },
  blockExplorers: { default: { name: 'Arcscan', url: NET.explorerUrl } },
  testnet: !IS_MAINNET,
});

export const txUrl = (hash: string) => `${NET.explorerUrl}/tx/${hash}`;
export const addressUrl = (address: string) => `${NET.explorerUrl}/address/${address}`;

export const usdc = (atomic: bigint | string) => `$${(Number(atomic) / 1e6).toFixed(6)}`;
