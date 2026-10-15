/**
 * Mode B: pay someone's stealth ID directly, no server on their side. The payer makes the
 * one-time address, sends USDC to it, and announces the ephemeral key on-chain (ERC-5564)
 * so the receiver can find it by scanning with their viewing key.
 */
import { createWalletClient, erc20Abi, http, verifyTypedData, type Account, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ARC_USDC,
  ERC20_TRANSFER_SELECTOR,
  TRANSFER_WITH_AUTHORIZATION_SELECTOR,
  PANSA_ANNOUNCER,
  PANSA_REGISTRY,
  SCHEME_ID,
  decodeStealthMetaAddress,
  encodeAnnouncementMetadata,
  generateStealthAddress,
  stealthMetaAddressToBytes,
  type StealthMetaAddress,
} from '@pansa/core';

export const ANNOUNCER_ABI = [
  {
    type: 'function',
    name: 'announce',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schemeId', type: 'uint256' },
      { name: 'stealthAddress', type: 'address' },
      { name: 'ephemeralPubKey', type: 'bytes' },
      { name: 'metadata', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Announcement',
    inputs: [
      { name: 'schemeId', type: 'uint256', indexed: true },
      { name: 'stealthAddress', type: 'address', indexed: true },
      { name: 'caller', type: 'address', indexed: true },
      { name: 'ephemeralPubKey', type: 'bytes', indexed: false },
      { name: 'metadata', type: 'bytes', indexed: false },
    ],
  },
] as const;

export const REGISTRY_ABI = [
  {
    type: 'function',
    name: 'registerKeys',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'schemeId', type: 'uint256' },
      { name: 'stealthMetaAddress', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'registerKeysOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'registrant', type: 'address' },
      { name: 'schemeId', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
      { name: 'stealthMetaAddress', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'nonceOf',
    stateMutability: 'view',
    inputs: [{ name: 'registrant', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'stealthMetaAddressOf',
    stateMutability: 'view',
    inputs: [
      { name: 'registrant', type: 'address' },
      { name: 'schemeId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
] as const;

export interface StealthPaymentResult {
  stealthAddress: Hex;
  ephemeralPublicKey: Hex;
  transferTx: Hex;
  announceTx: Hex;
}

/** Sends `amount` (atomic USDC) to a fresh address for `meta`, then announces it. */
export async function sendStealthPayment(args: {
  wallet: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  meta: StealthMetaAddress;
  amount: bigint;
  asset?: Hex;
  announcer?: Hex;
}): Promise<StealthPaymentResult> {
  const { wallet, publicClient, meta, amount } = args;
  const asset = args.asset ?? ARC_USDC;
  const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress(meta);

  const transferTx = await wallet.writeContract({
    address: asset,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [stealthAddress, amount],
  });
  const transfer = await publicClient.waitForTransactionReceipt({ hash: transferTx });
  if (transfer.status !== 'success') throw new Error(`transfer reverted: ${transferTx}`);

  const announceTx = await wallet.writeContract({
    address: args.announcer ?? PANSA_ANNOUNCER,
    abi: ANNOUNCER_ABI,
    functionName: 'announce',
    args: [
      SCHEME_ID,
      stealthAddress,
      ephemeralPublicKey,
      encodeAnnouncementMetadata({ viewTag, selector: ERC20_TRANSFER_SELECTOR, token: asset, amount }),
    ],
  });
  const announce = await publicClient.waitForTransactionReceipt({ hash: announceTx });
  if (announce.status !== 'success') throw new Error(`announce reverted: ${announceTx}`);

  return { stealthAddress, ephemeralPublicKey, transferTx, announceTx };
}

/** The stealth ID an account registered in the ERC-6538 registry, if any. */
export async function lookupStealthId(
  publicClient: PublicClient,
  account: Hex,
  registry: Hex = PANSA_REGISTRY,
): Promise<StealthMetaAddress | undefined> {
  const raw = await publicClient.readContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'stealthMetaAddressOf',
    args: [account, SCHEME_ID],
  });
  return raw && raw !== '0x' ? decodeStealthMetaAddress(raw) : undefined;
}

/** Pays whoever registered a stealth ID for `recipient` in the ERC-6538 registry. */
export async function payRegisteredAccount(args: {
  wallet: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  recipient: Hex;
  amount: bigint;
  registry?: Hex;
  asset?: Hex;
  announcer?: Hex;
}): Promise<StealthPaymentResult & { meta: StealthMetaAddress }> {
  const meta = await lookupStealthId(args.publicClient, args.recipient, args.registry);
  if (!meta) throw new Error(`${args.recipient} has no stealth ID in the registry`);
  return { meta, ...(await sendStealthPayment({ ...args, meta })) };
}

// ---- registration on behalf: the registrant signs, anyone pays the gas ----

export const REGISTRY_ENTRY_TYPES = {
  Erc6538RegistryEntry: [
    { name: 'schemeId', type: 'uint256' },
    { name: 'stealthMetaAddress', type: 'bytes' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const;

export function registryDomain(chainId: number, registry: Hex = PANSA_REGISTRY) {
  return { name: 'ERC6538Registry', version: '1.0', chainId, verifyingContract: registry } as const;
}

/** The EIP-712 message a registrant signs so someone else can register their stealth ID. */
export async function registrationTypedData(args: {
  publicClient: PublicClient;
  registrant: Hex;
  meta: StealthMetaAddress;
  chainId: number;
  registry?: Hex;
}) {
  const nonce = await args.publicClient.readContract({
    address: args.registry ?? PANSA_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: 'nonceOf',
    args: [args.registrant],
  });
  return {
    domain: registryDomain(args.chainId, args.registry),
    types: REGISTRY_ENTRY_TYPES,
    primaryType: 'Erc6538RegistryEntry' as const,
    message: { schemeId: SCHEME_ID, stealthMetaAddress: stealthMetaAddressToBytes(args.meta), nonce },
  };
}

/** Submits a signed registration, paying the gas. Checks the signature first so bad ones cost nothing. */
export async function registerOnBehalf(args: {
  wallet: WalletClient<Transport, Chain, Account>;
  publicClient: PublicClient;
  registrant: Hex;
  meta: StealthMetaAddress;
  signature: Hex;
  registry?: Hex;
}): Promise<Hex> {
  const registry = args.registry ?? PANSA_REGISTRY;
  const typed = await registrationTypedData({
    publicClient: args.publicClient,
    registrant: args.registrant,
    meta: args.meta,
    chainId: args.wallet.chain.id,
    registry,
  });
  const valid = await verifyTypedData({ address: args.registrant, ...typed, signature: args.signature });
  if (!valid) throw new Error('registration signature does not match the registrant');

  const hash = await args.wallet.writeContract({
    address: registry,
    abi: REGISTRY_ABI,
    functionName: 'registerKeysOnBehalf',
    args: [args.registrant, SCHEME_ID, args.signature, typed.message.stealthMetaAddress],
  });
  const receipt = await args.publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`registration reverted: ${hash}`);
  return hash;
}

export interface AnnounceFromStealthArgs {
  /** Key of the one-time address; it signs and pays the fee from the USDC it holds (Arc). */
  stealthPrivateKey: Hex;
  ephemeralPublicKey: Hex;
  viewTag: number;
  amount: bigint;
  chain: Chain;
  rpcUrl?: string;
  asset?: Hex;
  announcer?: Hex;
}

/**
 * Announces a payment that already landed (e.g. an x402 settlement) from the stealth address
 * itself, so the receiver can find it by scanning. The caller is that one-time address, so the
 * announcement links nothing to the seller.
 */
export async function announceFromStealthAddress(args: AnnounceFromStealthArgs): Promise<Hex> {
  const account = privateKeyToAccount(args.stealthPrivateKey);
  const asset = args.asset ?? ARC_USDC;
  const wallet = createWalletClient({ account, chain: args.chain, transport: http(args.rpcUrl) });
  return wallet.writeContract({
    address: args.announcer ?? PANSA_ANNOUNCER,
    abi: ANNOUNCER_ABI,
    functionName: 'announce',
    args: [
      SCHEME_ID,
      account.address,
      args.ephemeralPublicKey,
      encodeAnnouncementMetadata({ viewTag: args.viewTag, selector: TRANSFER_WITH_AUTHORIZATION_SELECTOR, token: asset, amount: args.amount }),
    ],
  });
}
