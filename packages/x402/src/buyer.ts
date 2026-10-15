/** Agent side: a fetch that pays x402 v2 `exact` requirements automatically, within a budget. */
import type { LocalAccount } from 'viem';
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
}

export interface PayingFetchOptions {
  account: LocalAccount;
  /** CAIP-2 networks we will pay on. */
  networks: string[];
  /** Max atomic units per request. */
  maxAmount: bigint;
  fetch?: typeof fetch;
  onPayment?: (info: PaidRequestInfo) => void;
}

export class PaymentRefusedError extends Error {}

export function createPayingFetch(opts: PayingFetchOptions): typeof fetch {
  const fetchFn = opts.fetch ?? fetch;

  return async (input, init) => {
    const first = await fetchFn(input, init);
    if (first.status !== 402) return first;

    const header = first.headers.get(HEADER_PAYMENT_REQUIRED);
    if (!header) return first;
    const required = decodeHeader<PaymentRequired>(header);
    const req = required.accepts?.find(
      (r) => r.scheme === 'exact' && opts.networks.includes(r.network) && BigInt(r.amount) <= opts.maxAmount,
    );
    if (!req) {
      throw new PaymentRefusedError(
        `no acceptable payment option (budget ${opts.maxAmount}, offered ${JSON.stringify(required.accepts?.map((r) => [r.network, r.amount]))})`,
      );
    }

    const payment: PaymentPayload = {
      x402Version: X402_VERSION,
      resource: required.resource,
      // Echo the requirements unchanged: the seller recognises its payTo from `extra`.
      accepted: req,
      payload: await signExactPayment(opts.account, req),
    };
    const headers = new Headers(init?.headers);
    headers.set(HEADER_PAYMENT_SIGNATURE, encodeHeader(payment));
    const paid = await fetchFn(input, { ...init, headers });

    if (paid.ok) {
      const response = paid.headers.get(HEADER_PAYMENT_RESPONSE);
      opts.onPayment?.({
        url: typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        requirements: req,
        settlement: response ? decodeHeader<SettlementResponse>(response) : undefined,
      });
    }
    return paid;
  };
}
