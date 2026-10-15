/**
 * Seller add-on: every 402 offers a fresh stealth payTo; paid requests are checked and
 * settled through a facilitator. The chain shows payments to unrelated one-time
 * addresses instead of to the seller's wallet.
 */
import {
  ARC_USDC,
  checkStealthAddress,
  computeStealthPrivateKey,
  generateStealthAddress,
  type Hex,
  type StealthMetaAddress,
} from '@pansapay/core';
import { isAddressEqual, type Chain } from 'viem';
import { announceFromStealthAddress, type AnnounceFromStealthArgs } from './direct.js';
import { decodeHeader, encodeHeader } from './encoding.js';
import { isSignedByPayer } from './eip3009.js';
import { FacilitatorError, type Facilitator } from './facilitator.js';
import { MemoryPaymentStore, type PaymentStore, type ReceivedPayment } from './store.js';
import {
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_RESPONSE,
  X402_VERSION,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
  type ResourceInfo,
  type SettlementResponse,
} from './types.js';

export interface StealthSellerOptions {
  /** Public half of the seller's stealth ID. */
  meta: StealthMetaAddress;
  /** Recognises our payTo addresses. */
  viewingKey: Hex;
  /**
   * Only needed for a facilitator that authenticates with a seller proof (Circle's keyless
   * trial). With an API key, leave it out so the server can't spend anything.
   */
  spendingKey?: Hex;
  /** CAIP-2, e.g. eip155:5042002 for Arc testnet. */
  network: string;
  facilitator: Facilitator;
  store?: PaymentStore;
  asset?: Hex;
  assetName?: string;
  assetVersion?: string;
  maxTimeoutSeconds?: number;
  now?: () => number;
  /**
   * Announce each payment on-chain (ERC-5564) so the seller's wallet finds it by scanning,
   * like direct payments. The one-time address announces itself and pays the ~$0.002 fee
   * from what it received, so this needs `spendingKey` and skips payments below `minAmount`.
   */
  announce?: {
    chain: Chain;
    rpcUrl?: string;
    /** Atomic units; default 10_000 ($0.01), since smaller payments wouldn't cover the fee. */
    minAmount?: bigint;
    onError?: (err: unknown) => void;
    /** Override for tests. */
    send?: (args: AnnounceFromStealthArgs) => Promise<Hex>;
  };
}

export interface Price {
  /** Atomic units (USDC has 6 decimals: 10_000n = $0.01). */
  amount: bigint;
  resource: ResourceInfo;
}

export interface HttpReply {
  status: number;
  headers: Record<string, string>;
  body: { error: string };
}

export type HandleResult =
  | { paid: false; reply: HttpReply }
  | { paid: true; payment: ReceivedPayment; headers: Record<string, string> };

export class StealthSeller {
  readonly store: PaymentStore;
  private readonly asset: Hex;
  private readonly now: () => number;

  constructor(private readonly opts: StealthSellerOptions) {
    if (opts.facilitator.needsPayToKey && !opts.spendingKey) {
      throw new Error('this facilitator signs with the payTo key: pass spendingKey, or use an API key');
    }
    if (opts.announce && !opts.spendingKey) {
      throw new Error('announce needs spendingKey: the one-time address signs its own announcement');
    }
    this.store = opts.store ?? new MemoryPaymentStore();
    this.asset = opts.asset ?? ARC_USDC;
    this.now = opts.now ?? (() => Math.floor(Date.now() / 1000));
  }

  /** Fresh one-time payTo for this request. */
  requirements(price: Price): PaymentRequirements {
    const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress(this.opts.meta);
    return {
      scheme: 'exact',
      network: this.opts.network,
      amount: price.amount.toString(),
      asset: this.asset,
      payTo: stealthAddress,
      maxTimeoutSeconds: this.opts.maxTimeoutSeconds ?? 120,
      extra: {
        name: this.opts.assetName ?? 'USDC',
        version: this.opts.assetVersion ?? '2',
        pansa: { v: 1, ephemeralPublicKey, viewTag },
      },
    };
  }

  paymentRequired(price: Price, error = 'payment required'): HttpReply {
    const body: PaymentRequired = {
      x402Version: X402_VERSION,
      error,
      resource: price.resource,
      accepts: [this.requirements(price)],
    };
    return { status: 402, headers: { [HEADER_PAYMENT_REQUIRED]: encodeHeader(body) }, body: { error } };
  }

  /** Call with the request's PAYMENT-SIGNATURE header (or null). Serve the resource only when `paid`. */
  async handle(paymentHeader: string | null | undefined, price: Price): Promise<HandleResult> {
    if (!paymentHeader) return { paid: false, reply: this.paymentRequired(price) };

    let payload: PaymentPayload;
    try {
      payload = decodeHeader<PaymentPayload>(paymentHeader);
    } catch {
      return this.reject(price, 'malformed payment header');
    }

    const problem = await this.check(payload, price);
    if (problem) return this.reject(price, problem);

    const { accepted, payload: exact } = payload;
    const pansa = accepted.extra!.pansa!;
    const authorizationId = `${exact.authorization.from.toLowerCase()}:${exact.authorization.nonce.toLowerCase()}`;
    if (!(await this.store.claim(authorizationId))) return this.reject(price, 'payment already used');

    const stealthKey = this.opts.spendingKey
      ? computeStealthPrivateKey(pansa.ephemeralPublicKey, { spendingKey: this.opts.spendingKey, viewingKey: this.opts.viewingKey })
      : undefined;
    let settlement: SettlementResponse;
    try {
      settlement = await this.opts.facilitator.settle(
        { x402Version: X402_VERSION, paymentPayload: payload, paymentRequirements: accepted },
        { payToPrivateKey: stealthKey },
      );
    } catch (err) {
      await this.store.release(authorizationId);
      const reason = err instanceof FacilitatorError ? err.code : 'facilitator unavailable';
      return this.reject(price, `settlement failed: ${reason}`);
    }

    // Pending is not paid: the buyer may retry with the same authorization.
    if (!settlement.success || !settlement.transaction) {
      await this.store.release(authorizationId);
      return this.reject(price, `settlement failed: ${settlement.errorReason ?? 'unknown'}`);
    }

    const payment: ReceivedPayment = {
      stealthAddress: accepted.payTo,
      ephemeralPublicKey: pansa.ephemeralPublicKey,
      viewTag: pansa.viewTag,
      amount: settlement.amount ?? accepted.amount,
      asset: accepted.asset,
      network: accepted.network,
      payer: exact.authorization.from,
      transaction: settlement.transaction as Hex,
      resource: price.resource.url,
      authorizationId,
      receivedAt: new Date(this.now() * 1000).toISOString(),
    };
    const ann = this.opts.announce;
    if (ann && stealthKey && BigInt(payment.amount) >= (ann.minAmount ?? 10_000n)) {
      try {
        payment.announcement = await (ann.send ?? announceFromStealthAddress)({
          stealthPrivateKey: stealthKey,
          ephemeralPublicKey: pansa.ephemeralPublicKey,
          viewTag: pansa.viewTag,
          amount: BigInt(payment.amount),
          asset: payment.asset,
          chain: ann.chain,
          rpcUrl: ann.rpcUrl,
        });
      } catch (err) {
        // The payment is settled either way; the store still lets the seller find it.
        ann.onError?.(err);
      }
    }
    await this.store.add(payment);
    return { paid: true, payment, headers: { [HEADER_PAYMENT_RESPONSE]: encodeHeader(settlement) } };
  }

  private async check(payload: PaymentPayload, price: Price): Promise<string | undefined> {
    if (payload?.x402Version !== X402_VERSION) return 'unsupported x402 version';
    const req = payload.accepted;
    const exact = payload.payload;
    if (!req || !exact?.authorization || !exact.signature) return 'malformed payment';
    if (req.scheme !== 'exact') return 'unsupported scheme';
    if (req.network !== this.opts.network) return 'wrong network';
    if (!isAddressEqual(req.asset, this.asset)) return 'wrong asset';
    if (req.amount !== price.amount.toString()) return 'wrong amount';

    // Is this one-time address really ours? (stateless: no lookup table)
    const pansa = req.extra?.pansa;
    if (pansa?.v !== 1) return 'missing stealth data';
    let ours = false;
    try {
      ours = checkStealthAddress(
        { stealthAddress: req.payTo, ephemeralPublicKey: pansa.ephemeralPublicKey, viewTag: pansa.viewTag },
        this.opts.viewingKey,
        this.opts.meta.spendingPublicKey,
      );
    } catch {
      // malformed ephemeral key
    }
    if (!ours) return 'unknown payTo';

    const auth = exact.authorization;
    if (!isAddressEqual(auth.to, req.payTo)) return 'authorization pays someone else';
    if (auth.value !== req.amount) return 'authorization amount mismatch';
    const now = this.now();
    if (BigInt(auth.validAfter) > BigInt(now)) return 'authorization not yet valid';
    // Leave the facilitator a few seconds to land it.
    if (BigInt(auth.validBefore) <= BigInt(now + 6)) return 'authorization expired';
    if (!(await isSignedByPayer(exact, req))) return 'bad signature';
    return undefined;
  }

  private reject(price: Price, error: string): HandleResult {
    return { paid: false, reply: this.paymentRequired(price, error) };
  }
}
