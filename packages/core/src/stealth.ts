/**
 * ERC-5564 scheme 1: secp256k1 stealth addresses with view tags.
 * Compatible with ScopeLift's stealth-address-sdk (compressed shared secret, keccak256).
 *
 *   sender:    P_stealth = P_spend + keccak(p_eph * P_view) * G
 *   receiver:  p_stealth = p_spend + keccak(p_view * P_eph)   (mod n)
 */
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bigIntToBytes, bytesToBigInt, bytesToHex, hexToBytes, toChecksumAddress, type Hex } from './bytes.js';

export const SCHEME_ID = 1n;

const Point = secp256k1.ProjectivePoint;
const N = secp256k1.CURVE.n;

export interface StealthKeys {
  spendingKey: Hex;
  viewingKey: Hex;
}

export interface StealthMetaAddress {
  spendingPublicKey: Hex;
  viewingPublicKey: Hex;
}

export interface GeneratedStealthAddress {
  stealthAddress: Hex;
  ephemeralPublicKey: Hex;
  viewTag: number;
}

export interface StealthPaymentRef {
  stealthAddress: Hex;
  ephemeralPublicKey: Hex;
  /** Skips the full check for ~255/256 of payments that aren't ours. */
  viewTag?: number;
}

/** Message a wallet signs to derive its stealth keys (see deriveStealthKeysFromSignature). */
export const STEALTH_KEYS_MESSAGE =
  'Sign this message to create your PANSA stealth keys.\n\n' +
  'Only sign this on a site you trust: anyone with this signature can see and spend your private payments.';

export function generateStealthKeys(): StealthKeys {
  return {
    spendingKey: bytesToHex(secp256k1.utils.randomPrivateKey()),
    viewingKey: bytesToHex(secp256k1.utils.randomPrivateKey()),
  };
}

/**
 * Derives stealth keys from a 65-byte signature over STEALTH_KEYS_MESSAGE, so a user
 * can recover them from their wallet alone. Requires a deterministic (RFC 6979) signer,
 * which plain EOAs and Privy embedded wallets are; smart-contract wallets are not.
 */
export function deriveStealthKeysFromSignature(signature: Hex): StealthKeys {
  const sig = hexToBytes(signature);
  if (sig.length !== 65) throw new Error('signature must be 65 bytes');
  return {
    spendingKey: hashToPrivateKey(sig.slice(0, 32)),
    viewingKey: hashToPrivateKey(sig.slice(32, 64)),
  };
}

export function getStealthMetaAddress(keys: StealthKeys): StealthMetaAddress {
  return {
    spendingPublicKey: bytesToHex(secp256k1.getPublicKey(hexToBytes(keys.spendingKey), true)),
    viewingPublicKey: bytesToHex(secp256k1.getPublicKey(hexToBytes(keys.viewingKey), true)),
  };
}

/** `st:<chain>:0x<spendingPubKey><viewingPubKey>` */
export function encodeStealthMetaAddress(meta: StealthMetaAddress, chain = 'arc'): string {
  return `st:${chain}:${stealthMetaAddressToBytes(meta)}`;
}

/** The 66-byte form stored in the ERC-6538 registry. */
export function stealthMetaAddressToBytes(meta: StealthMetaAddress): Hex {
  assertPoint(meta.spendingPublicKey);
  assertPoint(meta.viewingPublicKey);
  return `0x${meta.spendingPublicKey.slice(2)}${meta.viewingPublicKey.slice(2)}`;
}

/** Accepts `st:<chain>:0x…` or the raw 66-byte registry hex. */
export function decodeStealthMetaAddress(value: string): StealthMetaAddress {
  const match = /^(?:st:[a-z0-9-]+:)?(0x[0-9a-fA-F]{132})$/.exec(value.trim());
  if (!match) throw new Error('invalid stealth meta-address');
  const hex = match[1].toLowerCase();
  const meta: StealthMetaAddress = {
    spendingPublicKey: `0x${hex.slice(2, 68)}`,
    viewingPublicKey: `0x${hex.slice(68)}`,
  };
  assertPoint(meta.spendingPublicKey);
  assertPoint(meta.viewingPublicKey);
  return meta;
}

/** Sender side: a fresh one-time address only the meta-address owner can spend from. */
export function generateStealthAddress(meta: StealthMetaAddress, ephemeralKey?: Hex): GeneratedStealthAddress {
  const ephemeral = ephemeralKey ? hexToBytes(ephemeralKey) : secp256k1.utils.randomPrivateKey();
  const hashed = hashedSharedSecret(ephemeral, meta.viewingPublicKey);
  return {
    stealthAddress: stealthAddressFrom(meta.spendingPublicKey, hashed),
    ephemeralPublicKey: bytesToHex(secp256k1.getPublicKey(ephemeral, true)),
    viewTag: hashed[0],
  };
}

/** Receiver side: is this payment ours? Needs only the viewing key. */
export function checkStealthAddress(
  payment: StealthPaymentRef,
  viewingKey: Hex,
  spendingPublicKey: Hex,
): boolean {
  const hashed = hashedSharedSecret(hexToBytes(viewingKey), payment.ephemeralPublicKey);
  if (payment.viewTag !== undefined && hashed[0] !== payment.viewTag) return false;
  return stealthAddressFrom(spendingPublicKey, hashed).toLowerCase() === payment.stealthAddress.toLowerCase();
}

/** Receiver side: the private key that controls a stealth address. */
export function computeStealthPrivateKey(ephemeralPublicKey: Hex, keys: StealthKeys): Hex {
  const hashed = hashedSharedSecret(hexToBytes(keys.viewingKey), ephemeralPublicKey);
  const key = (bytesToBigInt(hexToBytes(keys.spendingKey)) + toScalar(hashed)) % N;
  if (key === 0n) throw new Error('stealth private key is zero');
  return bytesToHex(bigIntToBytes(key, 32));
}

export function publicKeyToAddress(publicKey: Hex): Hex {
  return pointToAddress(Point.fromHex(hexToBytes(publicKey)));
}

export function privateKeyToAddress(privateKey: Hex): Hex {
  return pointToAddress(Point.fromPrivateKey(hexToBytes(privateKey)));
}

function hashedSharedSecret(privateKey: Uint8Array, publicKey: Hex): Uint8Array {
  return keccak_256(secp256k1.getSharedSecret(privateKey, hexToBytes(publicKey), true));
}

function stealthAddressFrom(spendingPublicKey: Hex, hashed: Uint8Array): Hex {
  const point = Point.fromHex(hexToBytes(spendingPublicKey)).add(Point.BASE.multiply(toScalar(hashed)));
  return pointToAddress(point);
}

function pointToAddress(point: InstanceType<typeof Point>): Hex {
  const uncompressed = point.toRawBytes(false).slice(1);
  return toChecksumAddress(bytesToHex(keccak_256(uncompressed).slice(-20)));
}

function toScalar(hashed: Uint8Array): bigint {
  const s = bytesToBigInt(hashed) % N;
  if (s === 0n) throw new Error('hashed shared secret is zero');
  return s;
}

function hashToPrivateKey(seed: Uint8Array): Hex {
  return bytesToHex(bigIntToBytes(toScalar(keccak_256(seed)), 32));
}

function assertPoint(publicKey: Hex): void {
  const bytes = hexToBytes(publicKey);
  if (bytes.length !== 33) throw new Error('public key must be 33 bytes (compressed)');
  Point.fromHex(bytes).assertValidity();
}
