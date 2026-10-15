/** Agent side: a fetch that pays x402 v2 `exact` requirements automatically, within a budget. */
import type { LocalAccount } from 'viem';
import { ARC_USDC, generateStealthAddress, type Hex, type StealthMetaAddress } from '@pansa/core';
import { decodeHeader, encodeHeader } from './encoding.js';
import { signExactPayment } from './eip3009.js';
import {
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_RESPONSE,
  HEADER_PAYMENT_SIGNATURE,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type SettlementResponse,
} from './types.js';

export interface PaidRequestInfo {
  url: string;
  requirements: PaymentRequirements;
  settlement?: SettlementResponse;
  /** True when we derived payTo from the seller's known stealth ID instead of trusting the 402. */
  payeeVerified: boolean;
}

/** The seller's stealth ID for a URL, if we know it (e.g. looked up in the ERC-6538 registry). */
export type PayeeResolver = (url: string) => StealthMetaAddress | undefined | Promise<StealthMetaAddress | undefined>;

export interface PayingFetchOptions {
  account: LocalAccount;
  /** CAIP-2 networks we will pay on. */
  networks: string[];
  /** Max atomic units per request. */
  maxAmount: bigint;
  /**
   * Token contracts we will pay in (default: USDC on Arc). The budget is in atomic units,
   * so without this a server could ask for a different, more valuable token.
   */
  assets?: Hex[];
  /** Cap on how long a signed authorization stays valid, whatever the server asks (default 300s). */
  maxValidSeconds?: number;
  fetch?: typeof fetch;
  onPayment?: (info: PaidRequestInfo) => void;
  /**
   * Pay only this seller. We make the one-time address ourselves from its stealth ID and
   * ignore the payTo in the 402, so a compromised or spoofed server can't redirect funds.
   */
  payee?: StealthMetaAddress | PayeeResolver;
}

export class PaymentRefusedError extends Error {}

export function createPayingFetch(opts: PayingFetchOptions): typeof fetch {
  const fetchFn = opts.fetch ?? fetch;
  const assets = (opts.assets ?? [ARC_USDC]).map((a) => a.toLowerCase());

  return async (input, init) => {
    const first = await fetchFn(input, init);
    if (first.status !== 402) return first;

    const header = first.headers.get(HEADER_PAYMENT_REQUIRED);
    if (!header) return first;
    const required = decodeHeader<PaymentRequired>(header);
    const offered = required.accepts?.find(
      (r) =>
        r.scheme === 'exact' &&
        opts.networks.includes(r.network) &&
        assets.includes(r.asset?.toLowerCase()) &&
        BigInt(r.amount) <= opts.maxAmount,
    );
    if (!offered) {
      throw new PaymentRefusedError(
        `no acceptable payment option (budget ${opts.maxAmount}, offered ${JSON.stringify(required.accepts?.map((r) => [r.network, r.asset, r.amount]))})`,
      );
    }

    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const payee = typeof opts.payee === 'function' ? await opts.payee(url) : opts.payee;
    let req = offered;
    if (payee) {
      const own = generateStealthAddress(payee);
      req = {
        ...offered,
        payTo: own.stealthAddress,
        extra: { ...offered.extra, pansa: { v: 1, ephemeralPublicKey: own.ephemeralPublicKey, viewTag: own.viewTag } },
      };
    }

    const payment: PaymentPayload = {
      x402Version: X402_VERSION,
      resource: required.resource,
      // The seller recognises its payTo from `extra.pansa`, whoever generated it.
      accepted: req,
      payload: await signExactPayment(opts.account, req, undefined, opts.maxValidSeconds ?? 300),
    };
    const headers = new Headers(init?.headers);
    headers.set(HEADER_PAYMENT_SIGNATURE, encodeHeader(payment));
    const paid = await fetchFn(input, { ...init, headers });

    if (paid.ok) {
      const response = paid.headers.get(HEADER_PAYMENT_RESPONSE);
      opts.onPayment?.({
        url,
        requirements: req,
        settlement: response ? decodeHeader<SettlementResponse>(response) : undefined,
        payeeVerified: !!payee,
      });
    }
    return paid;
  };
}
