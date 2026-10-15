/** x402 v2 wire types. Spec: github.com/coinbase/x402/blob/main/specs/x402-specification-v2.md */
import type { Hex } from '@pansa/core';

export const X402_VERSION = 2;

/** HTTP transport headers, each a base64-encoded JSON object. */
export const HEADER_PAYMENT_REQUIRED = 'PAYMENT-REQUIRED';
export const HEADER_PAYMENT_SIGNATURE = 'PAYMENT-SIGNATURE';
export const HEADER_PAYMENT_RESPONSE = 'PAYMENT-RESPONSE';

export interface ResourceInfo {
  url: string;
  description?: string;
  mimeType?: string;
}

export interface PaymentRequirements {
  scheme: string;
  /** CAIP-2, e.g. eip155:5042002 */
  network: string;
  /** Atomic units (USDC: 6 decimals). */
  amount: string;
  asset: Hex;
  payTo: Hex;
  maxTimeoutSeconds: number;
  extra?: PaymentExtra;
}

/** EIP-712 domain of the asset, plus PANSA's stealth data. */
export interface PaymentExtra {
  name?: string;
  version?: string;
  pansa?: PansaExtra;
  [key: string]: unknown;
}

/**
 * Lets a stateless seller recognise its own one-time payTo when the buyer echoes the
 * requirements back. Public by design: without the viewing key it links nothing.
 */
export interface PansaExtra {
  v: 1;
  ephemeralPublicKey: Hex;
  viewTag: number;
}

export interface PaymentRequired {
  x402Version: typeof X402_VERSION;
  error?: string;
  resource: ResourceInfo;
  accepts: PaymentRequirements[];
  extensions?: Record<string, unknown>;
}

/** EIP-3009 transferWithAuthorization parameters. */
export interface ExactEvmAuthorization {
  from: Hex;
  to: Hex;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface ExactEvmPayload {
  signature: Hex;
  authorization: ExactEvmAuthorization;
}

export interface PaymentPayload {
  x402Version: typeof X402_VERSION;
  resource?: ResourceInfo;
  accepted: PaymentRequirements;
  payload: ExactEvmPayload;
  extensions?: Record<string, unknown>;
}

export interface FacilitatorRequest {
  x402Version: typeof X402_VERSION;
  paymentPayload: PaymentPayload;
  paymentRequirements: PaymentRequirements;
}

export interface SettlementResponse {
  success: boolean;
  errorReason?: string;
  payer?: string;
  /** Empty string unless settled. */
  transaction: string;
  network: string;
  amount?: string;
  extensions?: Record<string, unknown>;
}
