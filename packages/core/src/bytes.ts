import { keccak_256 } from '@noble/hashes/sha3';

export type Hex = `0x${string}`;

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(h)) throw new Error(`invalid hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): Hex {
  let out = '0x';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out as Hex;
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  return bytes.length === 0 ? 0n : BigInt(bytesToHex(bytes));
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  if (value < 0n) throw new Error('negative value');
  const hex = value.toString(16).padStart(length * 2, '0');
  if (hex.length > length * 2) throw new Error(`value does not fit in ${length} bytes`);
  return hexToBytes(hex);
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** EIP-55 mixed-case checksum. */
export function toChecksumAddress(address: string): Hex {
  const lower = address.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{40}$/.test(lower)) throw new Error(`invalid address: ${address}`);
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower))).slice(2);
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out as Hex;
}
