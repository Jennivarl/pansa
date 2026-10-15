import { createPublicClient, defineChain, http, type Chain } from 'viem';
import type { Info } from '../api';

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11';

export function arcChainFrom(info: Info): Chain {
  return defineChain({
    id: info.chainId,
    name: info.networkName,
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [info.rpcUrl] } },
    blockExplorers: { default: { name: 'Arcscan', url: info.explorerUrl } },
    contracts: { multicall3: { address: MULTICALL3 } },
    testnet: !info.mainnet,
  });
}

export function publicClientFor(chain: Chain) {
  return createPublicClient({ chain, transport: http() });
}
