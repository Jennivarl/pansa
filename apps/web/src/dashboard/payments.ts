/**
 * Finds and spends the user's stealth payments, entirely in the browser. The server only
 * hands out the full public list of announcements; keys never leave this page.
 */
import { createWalletClient, erc20Abi, http, type Chain, type Hex, type PublicClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  getStealthMetaAddress,
  scanAnnouncements,
  type Announcement,
  type StealthKeys,
} from '@pansa/core';

export interface FoundPayment {
  stealthAddress: Hex;
  stealthPrivateKey: Hex;
  announcedAmount: bigint;
  balance: bigint;
  transactionHash: Hex;
  blockNumber: bigint;
}

interface IndexedAnnouncement {
  schemeId: string;
  stealthAddress: Hex;
  caller: Hex;
  ephemeralPublicKey: Hex;
  metadata: Hex;
  blockNumber: string;
  transactionHash: Hex;
}

export async function findPayments(keys: StealthKeys, client: PublicClient, usdc: Hex): Promise<FoundPayment[]> {
  const res = await fetch('/api/announcements');
  if (!res.ok) throw new Error(`announcements: HTTP ${res.status}`);
  const { announcements } = (await res.json()) as { announcements: IndexedAnnouncement[] };

  const byAddress = new Map(announcements.map((a) => [a.stealthAddress.toLowerCase(), a]));
  const list: Announcement[] = announcements.map((a) => ({
    schemeId: BigInt(a.schemeId),
    stealthAddress: a.stealthAddress,
    caller: a.caller,
    ephemeralPublicKey: a.ephemeralPublicKey,
    metadata: a.metadata,
  }));
  const meta = getStealthMetaAddress(keys);
  const mine = scanAnnouncements(list, {
    viewingKey: keys.viewingKey,
    spendingPublicKey: meta.spendingPublicKey,
    spendingKey: keys.spendingKey,
  });
  if (mine.length === 0) return [];

  const balances = await client.multicall({
    allowFailure: false,
    contracts: mine.map((m) => ({
      address: usdc,
      abi: erc20Abi,
      functionName: 'balanceOf' as const,
      args: [m.stealthAddress] as const,
    })),
  });

  return mine
    .map((m, i) => {
      const a = byAddress.get(m.stealthAddress.toLowerCase())!;
      return {
        stealthAddress: m.stealthAddress,
        stealthPrivateKey: m.stealthPrivateKey!,
        announcedAmount: m.amount,
        balance: balances[i] as bigint,
        transactionHash: a.transactionHash,
        blockNumber: BigInt(a.blockNumber),
      };
    })
    .sort((x, y) => Number(y.blockNumber - x.blockNumber));
}

/**
 * Sends USDC from a one-time address. Its own USDC pays the gas (Arc), so nothing has to
 * be topped up from another wallet. `amount` undefined = send everything left after gas.
 */
export async function spendFromStealthAddress(args: {
  payment: FoundPayment;
  to: Hex;
  amount?: bigint;
  chain: Chain;
  client: PublicClient;
  usdc: Hex;
}): Promise<{ hash: Hex; sent: bigint }> {
  const account = privateKeyToAccount(args.payment.stealthPrivateKey);
  const wallet = createWalletClient({ account, chain: args.chain, transport: http() });

  let amount = args.amount;
  if (amount === undefined) {
    const balance = await args.client.readContract({
      address: args.usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account.address],
    });
    const gas = await args.client.estimateContractGas({
      account,
      address: args.usdc,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [args.to, balance],
    });
    const gasPrice = await args.client.getGasPrice();
    // Gas is native USDC (18 decimals); the ERC-20 view has 6. Keep a 25% margin.
    const fee6 = (gas * gasPrice * 5n) / 4n / 10n ** 12n + 1n;
    if (balance <= fee6) throw new Error('Balance is too small to cover the network fee.');
    amount = balance - fee6;
  }

  const hash = await wallet.writeContract({
    address: args.usdc,
    abi: erc20Abi,
    functionName: 'transfer',
    args: [args.to, amount],
  });
  const receipt = await args.client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error(`Transfer reverted: ${hash}`);
  return { hash, sent: amount };
}
