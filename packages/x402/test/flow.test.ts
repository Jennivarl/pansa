import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { keccak256, recoverTypedDataAddress, stringToBytes, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress } from 'viem/accounts';
import {
  ARC_TESTNET,
  ARC_USDC,
  computeStealthPrivateKey,
  generateStealthKeys,
  getStealthMetaAddress,
} from '@pansa/core';
import {
  CircleFacilitator,
  HEADER_PAYMENT_REQUIRED,
  HEADER_PAYMENT_SIGNATURE,
  PaymentRefusedError,
  SELLER_REQUEST_TYPES,
  StealthSeller,
  createPayingFetch,
  decodeHeader,
  encodeHeader,
  isSignedByPayer,
  sellerProofDomain,
  signExactPayment,
  type FacilitatorRequest,
  type PaymentPayload,
  type PaymentRequired,
  type Price,
  type SellerProofEnvelope,
} from '../src/index.js';
import { JsonFilePaymentStore } from '../src/node.js';

const NETWORK = ARC_TESTNET.caip2;
const price: Price = { amount: 10_000n, resource: { url: 'https://api.example/weather', description: 'weather' } };
const sellerKeys = generateStealthKeys();
const meta = getStealthMetaAddress(sellerKeys);
const buyer = privateKeyToAccount(generatePrivateKey());

/** Stands in for api.circle.com: checks auth like the real service, then "settles". */
function mockCircle(opts: { fail?: string; expectApiKey?: string } = {}) {
  const calls: { request: FacilitatorRequest; proofSigner?: Hex; authorization?: string }[] = [];
  let failNext = opts.fail;
  const fetchFn: typeof fetch = async (_url, init) => {
    const body = init!.body as string;
    const headers = new Headers(init!.headers);
    const request = JSON.parse(body) as FacilitatorRequest;
    const proofHeader = headers.get('facilitator-seller-proof');
    let proofSigner: Hex | undefined;
    if (proofHeader) {
      const env = decodeHeader<SellerProofEnvelope>(proofHeader);
      proofSigner = await recoverTypedDataAddress({
        domain: sellerProofDomain(env.network),
        types: SELLER_REQUEST_TYPES,
        primaryType: 'SellerRequest',
        message: {
          purpose: 'settle',
          method: 'POST',
          bodyHash: keccak256(stringToBytes(body)),
          network: env.network,
          payTo: env.payTo,
          nonce: env.nonce,
          issuedAt: BigInt(env.issuedAt),
          expiresAt: BigInt(env.expiresAt),
        },
        signature: env.signature,
      });
      if (proofSigner !== request.paymentRequirements.payTo) {
        return Response.json({ code: 'seller_proof_mismatch', message: 'bad proof' }, { status: 401 });
      }
    }
    calls.push({ request, proofSigner, authorization: headers.get('authorization') ?? undefined });
    if (failNext) {
      const errorReason = failNext;
      failNext = undefined;
      return Response.json({ success: false, errorReason, transaction: '', network: NETWORK });
    }
    return Response.json({
      success: true,
      transaction: `0x${'ab'.repeat(32)}`,
      network: NETWORK,
      payer: request.paymentPayload.payload.authorization.from,
      amount: request.paymentRequirements.amount,
    });
  };
  return { fetchFn, calls };
}

function makeSeller(facilitatorFetch: typeof fetch, extra: Partial<ConstructorParameters<typeof StealthSeller>[0]> = {}) {
  return new StealthSeller({
    meta,
    viewingKey: sellerKeys.viewingKey,
    spendingKey: sellerKeys.spendingKey,
    network: NETWORK,
    facilitator: new CircleFacilitator({ fetch: facilitatorFetch }),
    ...extra,
  });
}

/** A paid API endpoint backed by the seller add-on. */
function api(seller: StealthSeller): typeof fetch {
  return async (_input, init) => {
    const result = await seller.handle(new Headers(init?.headers).get(HEADER_PAYMENT_SIGNATURE), price);
    if (!result.paid) return Response.json(result.reply.body, { status: 402, headers: result.reply.headers });
    return Response.json({ forecast: 'sunny' }, { headers: result.headers });
  };
}

async function firstOffer(seller: StealthSeller) {
  const res = await api(seller)('https://api.example/weather');
  return decodeHeader<PaymentRequired>(res.headers.get(HEADER_PAYMENT_REQUIRED)!);
}

async function pay(seller: StealthSeller, payload: PaymentPayload) {
  return api(seller)('https://api.example/weather', { headers: { [HEADER_PAYMENT_SIGNATURE]: encodeHeader(payload) } });
}

async function signedPayload(seller: StealthSeller, tweak?: (p: PaymentPayload) => void): Promise<PaymentPayload> {
  const offer = await firstOffer(seller);
  const accepted = offer.accepts[0];
  const payload: PaymentPayload = {
    x402Version: 2,
    resource: offer.resource,
    accepted,
    payload: await signExactPayment(buyer, accepted),
  };
  tweak?.(payload);
  return payload;
}

describe('agent pays a PANSA seller', () => {
  it('pays a fresh stealth address the seller can open', async () => {
    const circle = mockCircle();
    const seller = makeSeller(circle.fetchFn);
    const paid: string[] = [];
    const payingFetch = createPayingFetch({
      account: buyer,
      networks: [NETWORK],
      maxAmount: 50_000n,
      fetch: api(seller),
      onPayment: (p) => paid.push(p.requirements.payTo),
    });

    const res1 = await payingFetch('https://api.example/weather');
    const res2 = await payingFetch('https://api.example/weather');
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ forecast: 'sunny' });
    expect(res2.status).toBe(200);

    const payments = await seller.store.list();
    expect(payments).toHaveLength(2);
    expect(payments[0].stealthAddress).not.toBe(payments[1].stealthAddress);
    expect(paid).toEqual(payments.map((p) => p.stealthAddress));

    for (const [i, p] of payments.entries()) {
      // seller can spend it
      expect(privateKeyToAddress(computeStealthPrivateKey(p.ephemeralPublicKey, sellerKeys))).toBe(p.stealthAddress);
      // Circle saw a valid seller proof from that one-time address, and a real EIP-3009 signature
      const call = circle.calls[i];
      expect(call.proofSigner).toBe(p.stealthAddress);
      expect(call.request.paymentRequirements.asset).toBe(ARC_USDC);
      expect(await isSignedByPayer(call.request.paymentPayload.payload, call.request.paymentRequirements)).toBe(true);
      expect(p.payer).toBe(buyer.address);
      expect(p.amount).toBe('10000');
    }
  });

  it('refuses to pay over budget', async () => {
    const payingFetch = createPayingFetch({
      account: buyer,
      networks: [NETWORK],
      maxAmount: 9_999n,
      fetch: api(makeSeller(mockCircle().fetchFn)),
    });
    await expect(payingFetch('https://api.example/weather')).rejects.toBeInstanceOf(PaymentRefusedError);
  });
});

describe('seller rejects bad payments', () => {
  async function expectRejected(payload: PaymentPayload, seller: StealthSeller, error: string) {
    const res = await pay(seller, payload);
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe(error);
    // and offers a fresh address to retry with
    expect(res.headers.get(HEADER_PAYMENT_REQUIRED)).toBeTruthy();
  }

  it('payTo swapped for an address that is not ours', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const other = privateKeyToAddress(generatePrivateKey());
    const payload = await signedPayload(seller, (p) => {
      p.accepted.payTo = other;
    });
    await expectRejected(payload, seller, 'unknown payTo');
  });

  it('authorization pays someone else', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const payload = await signedPayload(seller);
    const accepted = { ...payload.accepted, payTo: privateKeyToAddress(generatePrivateKey()) };
    payload.payload = await signExactPayment(buyer, accepted);
    await expectRejected(payload, seller, 'authorization pays someone else');
  });

  it('underpays', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const payload = await signedPayload(seller);
    payload.accepted = { ...payload.accepted, amount: '1' };
    payload.payload = await signExactPayment(buyer, payload.accepted);
    await expectRejected(payload, seller, 'wrong amount');
  });

  it('forged signature', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const payload = await signedPayload(seller, (p) => {
      p.payload.authorization.from = privateKeyToAddress(generatePrivateKey());
    });
    await expectRejected(payload, seller, 'bad signature');
  });

  it('expired authorization', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const offer = await firstOffer(seller);
    const payload: PaymentPayload = {
      x402Version: 2,
      accepted: offer.accepts[0],
      payload: await signExactPayment(buyer, offer.accepts[0], Math.floor(Date.now() / 1000) - 1_000),
    };
    await expectRejected(payload, seller, 'authorization expired');
  });

  it('wrong network', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const payload = await signedPayload(seller, (p) => {
      p.accepted.network = 'eip155:8453';
    });
    await expectRejected(payload, seller, 'wrong network');
  });

  it('same payment twice', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const payload = await signedPayload(seller);
    expect((await pay(seller, payload)).status).toBe(200);
    await expectRejected(payload, seller, 'payment already used');
  });

  it('garbage header', async () => {
    const seller = makeSeller(mockCircle().fetchFn);
    const res = await api(seller)('https://api.example/weather', { headers: { [HEADER_PAYMENT_SIGNATURE]: 'not base64 json' } });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe('malformed payment header');
  });
});

describe('settlement', () => {
  it('failed settlement is not served, and the buyer can retry', async () => {
    const circle = mockCircle({ fail: 'settlement_pending' });
    const seller = makeSeller(circle.fetchFn);
    const payload = await signedPayload(seller);

    const first = await pay(seller, payload);
    expect(first.status).toBe(402);
    expect((await first.json()).error).toBe('settlement failed: settlement_pending');
    expect(await seller.store.list()).toHaveLength(0);

    expect((await pay(seller, payload)).status).toBe(200);
    expect(await seller.store.list()).toHaveLength(1);
  });

  it('API key mode: no seller proof, server holds no spending key', async () => {
    const circle = mockCircle();
    const seller = new StealthSeller({
      meta,
      viewingKey: sellerKeys.viewingKey,
      network: NETWORK,
      facilitator: new CircleFacilitator({ apiKey: 'test-key', fetch: circle.fetchFn }),
    });
    expect((await pay(seller, await signedPayload(seller))).status).toBe(200);
    expect(circle.calls[0].authorization).toBe('Bearer test-key');
    expect(circle.calls[0].proofSigner).toBeUndefined();
  });

  it('keyless trial without a spending key is a config error', () => {
    expect(
      () =>
        new StealthSeller({
          meta,
          viewingKey: sellerKeys.viewingKey,
          network: NETWORK,
          facilitator: new CircleFacilitator({ fetch: mockCircle().fetchFn }),
        }),
    ).toThrow(/spendingKey/);
  });
});

describe('JsonFilePaymentStore', () => {
  it('persists payments and remembers used authorizations', async () => {
    const path = join(await mkdtemp(join(tmpdir(), 'pansa-')), 'payments.json');
    const seller = makeSeller(mockCircle().fetchFn, { store: new JsonFilePaymentStore(path) });
    const payload = await signedPayload(seller);
    expect((await pay(seller, payload)).status).toBe(200);

    const reopened = new JsonFilePaymentStore(path);
    const saved = await reopened.list();
    expect(saved).toHaveLength(1);
    expect(saved[0].stealthAddress).toBe(payload.accepted.payTo);
    expect(await reopened.claim(saved[0].authorizationId)).toBe(false);
  });
});
