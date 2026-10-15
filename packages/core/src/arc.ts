/** Arc network constants. Source: https://docs.arc.io/arc/references/connect-to-arc */
export const ARC_MAINNET = {
  id: 5042,
  caip2: 'eip155:5042',
  name: 'Arc',
  rpcUrl: 'https://rpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
} as const;

export const ARC_TESTNET = {
  id: 5042002,
  caip2: 'eip155:5042002',
  name: 'Arc Testnet',
  rpcUrl: 'https://rpc.testnet.arc.io',
  explorerUrl: 'https://explorer.testnet.arc.io',
  faucetUrl: 'https://faucet.circle.com',
} as const;

/**
 * USDC on Arc has two interfaces over one balance: native (18 decimals, used for gas)
 * and ERC-20 (6 decimals). A stealth address that receives ERC-20 USDC can therefore
 * pay its own gas — no ETH top-up that would link it back to its owner.
 */
export const USDC_NATIVE_DECIMALS = 18;
export const USDC_ERC20_DECIMALS = 6;

/** Same address on mainnet and testnet. Source: https://docs.arc.io/arc/references/contract-addresses */
export const ARC_USDC = '0x3600000000000000000000000000000000000000' as const;
export const ARC_CREATE2_FACTORY = '0x4e59b44847b379578588920cA78FbF26c0B4956C' as const;

/**
 * PANSA contracts, deployed through the CREATE2 factory with salt keccak256("pansa.v1"),
 * so the addresses are the same on every network.
 */
export const PANSA_ANNOUNCER = '0xb040Ee2a26cbBf36899aaB2aEdEBA7f7B1CC4D85' as const;
export const PANSA_REGISTRY = '0x974caaa9b4c3A0eff11E0a5b65aa36C41b8EaC1F' as const;
/** First block worth scanning for announcements, per chain id. */
export const PANSA_DEPLOY_BLOCK: Record<number, bigint> = {
  5042002: 67250688n,
};

/** Arc RPCs cap eth_getLogs ranges (10k is refused; 5k works). */
export const ARC_MAX_LOG_RANGE = 5_000n;
