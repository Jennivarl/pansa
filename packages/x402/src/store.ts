import type { Hex } from '@pansa/core';

/** What a seller needs to find and later spend a payment. */
export interface ReceivedPayment {
  stealthAddress: Hex;
  ephemeralPublicKey: Hex;
  viewTag: number;
  /** Atomic units. */
  amount: string;
  asset: Hex;
  network: string;
  payer: Hex;
  transaction: Hex;
  resource: string;
  /** `${payer}:${authorizationNonce}`, guards against double fulfilment. */
  authorizationId: string;
  /** ERC-5564 announcement tx, when the seller announces x402 payments on-chain. */
  announcement?: Hex;
  receivedAt: string;
}

export interface PaymentStore {
  /** Claims an authorization id; false if already claimed. */
  claim(authorizationId: string): Promise<boolean>;
  /** Frees a claim after a failed settlement so the buyer can retry. */
  release(authorizationId: string): Promise<void>;
  add(payment: ReceivedPayment): Promise<void>;
  list(): Promise<ReceivedPayment[]>;
}

export class MemoryPaymentStore implements PaymentStore {
  private readonly claimed = new Set<string>();
  private readonly payments: ReceivedPayment[] = [];

  async claim(id: string) {
    if (this.claimed.has(id)) return false;
    this.claimed.add(id);
    return true;
  }

  async release(id: string) {
    this.claimed.delete(id);
  }

  async add(payment: ReceivedPayment) {
    this.payments.push(payment);
  }

  async list() {
    return [...this.payments];
  }
}
