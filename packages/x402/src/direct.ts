/**
 * Mode B: pay someone's stealth ID directly, no server on their side. The payer makes the
 * one-time address, sends USDC to it, and announces the ephemeral key on-chain (ERC-5564)
 * so the receiver can find it by scanning with their viewing key.
 */
import { erc20Abi, type Account, type Chain, type Hex, type PublicClient, type Transport, type WalletClient } from 'viem';
import {
  ARC_USDC,
  ERC20_TRANSFER_SELECTOR,
  PANSA_ANNOUNCER,
  PANSA_REGISTRY,
  SCHEME_ID,
  decodeStealthMetaAddress,
  encodeAnnouncementMetadata,
  generateStealthAddress,
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
