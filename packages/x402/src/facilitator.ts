/** Circle Facilitator Service client. Docs: developers.circle.com/facilitator-service */
import { bytesToHex, keccak256, stringToBytes, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base64UrlEncode, chainIdFromCaip2 } from './encoding.js';
import type { FacilitatorRequest, SettlementResponse } from './types.js';

export const CIRCLE_FACILITATOR_URL = 'https://api.circle.com/v1/facilitator/x402';

export interface SettleAuth {
  /** Private key of `paymentRequirements.payTo`, for the keyless trial's seller proof. */
  payToPrivateKey?: Hex;
}

export interface Facilitator {
  /** True when settling needs the payTo key (seller proof) rather than an API key. */
  readonly needsPayToKey: boolean;
  settle(request: FacilitatorRequest, auth: SettleAuth): Promise<SettlementResponse>;
}

export class FacilitatorError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(`facilitator ${status} ${code}: ${message}`);
  }
}

export interface CircleFacilitatorOptions {
  /** Production auth. Without it, uses the keyless trial (Arc testnet) with a seller proof. */
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
}

export class CircleFacilitator implements Facilitator {
  readonly needsPayToKey: boolean;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly opts: CircleFacilitatorOptions = {}) {
    this.needsPayToKey = !opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? CIRCLE_FACILITATOR_URL).replace(/\/$/, '');
    this.fetchFn = opts.fetch ?? fetch;
  }

  async settle(request: FacilitatorRequest, auth: SettleAuth): Promise<SettlementResponse> {
    // The seller proof signs a hash of these exact bytes, so serialize once.
    const body = JSON.stringify(request);
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.opts.apiKey) {
      headers.authorization = `Bearer ${this.opts.apiKey}`;
    } else {
      if (!auth.payToPrivateKey) throw new Error('keyless trial needs the payTo private key for the seller proof');
      headers['facilitator-seller-proof'] = await createSellerProof({
        purpose: 'settle',
        method: 'POST',
        body,
        network: request.paymentRequirements.network,
        payToPrivateKey: auth.payToPrivateKey,
      });
    }

    const res = await this.fetchFn(`${this.baseUrl}/settle`, { method: 'POST', headers, body });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new FacilitatorError(res.status, String(json.code ?? 'error'), String(json.message ?? res.statusText));
    }
    return json as unknown as SettlementResponse;
  }
}

export const SELLER_REQUEST_TYPES = {
  SellerRequest: [
    { name: 'purpose', type: 'string' },
    { name: 'method', type: 'string' },
    { name: 'bodyHash', type: 'bytes32' },
    { name: 'network', type: 'string' },
    { name: 'payTo', type: 'address' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'issuedAt', type: 'uint64' },
    { name: 'expiresAt', type: 'uint64' },
  ],
} as const;

export function sellerProofDomain(network: string) {
  return { name: 'Circle Facilitator Seller Request', version: '1', chainId: chainIdFromCaip2(network) } as const;
}

export interface SellerProofEnvelope {
  version: 1;
  signature: Hex;
  network: string;
  payTo: Hex;
  nonce: Hex;
  issuedAt: number;
  expiresAt: number;
}

/** EIP-712 proof that we control payTo, sent as the `Facilitator-Seller-Proof` header. */
export async function createSellerProof(args: {
  purpose: 'verify' | 'settle' | 'status';
  method: string;
  body: string;
  network: string;
  payToPrivateKey: Hex;
  now?: number;
}): Promise<string> {
  const account = privateKeyToAccount(args.payToPrivateKey);
  const issuedAt = args.now ?? Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 120;
  const nonce = bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
  const signature = await account.signTypedData({
    domain: sellerProofDomain(args.network),
    types: SELLER_REQUEST_TYPES,
    primaryType: 'SellerRequest',
    message: {
      purpose: args.purpose,
      method: args.method.toUpperCase(),
      bodyHash: keccak256(stringToBytes(args.body)),
      network: args.network,
      payTo: account.address,
      nonce,
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt),
    },
  });
  const envelope: SellerProofEnvelope = {
    version: 1,
    signature,
    network: args.network,
    payTo: account.address,
    nonce,
    issuedAt,
    expiresAt,
  };
  return base64UrlEncode(JSON.stringify(envelope));
}
