/** The `exact` EVM scheme: an EIP-3009 transferWithAuthorization the facilitator submits. */
import { bytesToHex, recoverTypedDataAddress, isAddressEqual, type LocalAccount } from 'viem';
import { chainIdFromCaip2 } from './encoding.js';
import type { ExactEvmAuthorization, ExactEvmPayload, PaymentRequirements } from './types.js';

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
} as const;

export function assetDomain(req: PaymentRequirements) {
  return {
    name: req.extra?.name ?? 'USDC',
    version: req.extra?.version ?? '2',
    chainId: chainIdFromCaip2(req.network),
    verifyingContract: req.asset,
  };
}

function typedMessage(auth: ExactEvmAuthorization) {
  return {
    from: auth.from,
    to: auth.to,
    value: BigInt(auth.value),
    validAfter: BigInt(auth.validAfter),
    validBefore: BigInt(auth.validBefore),
    nonce: auth.nonce,
  };
}

/**
 * Buyer side: authorize paying exactly `req.amount` to `req.payTo`. The authorization
 * lives for the server's `maxTimeoutSeconds`, capped at `maxValidSeconds`.
 */
export async function signExactPayment(
  account: LocalAccount,
  req: PaymentRequirements,
  now = Math.floor(Date.now() / 1000),
  maxValidSeconds = Infinity,
): Promise<ExactEvmPayload> {
  const authorization: ExactEvmAuthorization = {
    from: account.address,
    to: req.payTo,
    value: req.amount,
    // Small backdate tolerates clock skew between buyer and chain.
    validAfter: String(now - 600),
    validBefore: String(now + Math.min(req.maxTimeoutSeconds, maxValidSeconds)),
    nonce: bytesToHex(crypto.getRandomValues(new Uint8Array(32))),
  };
  const signature = await account.signTypedData({
    domain: assetDomain(req),
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: 'TransferWithAuthorization',
    message: typedMessage(authorization),
  });
  return { signature, authorization };
}

/** EOA check only; smart-wallet (ERC-1271) payers are left to the facilitator. */
export async function isSignedByPayer(payload: ExactEvmPayload, req: PaymentRequirements): Promise<boolean> {
  try {
    const signer = await recoverTypedDataAddress({
      domain: assetDomain(req),
      types: TRANSFER_WITH_AUTHORIZATION_TYPES,
      primaryType: 'TransferWithAuthorization',
      message: typedMessage(payload.authorization),
      signature: payload.signature,
    });
    return isAddressEqual(signer, payload.authorization.from);
  } catch {
    return false;
  }
}
