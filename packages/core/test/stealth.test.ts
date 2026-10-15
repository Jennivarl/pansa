import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { generatePrivateKey, privateKeyToAccount, privateKeyToAddress as viemPrivateKeyToAddress } from 'viem/accounts';
import {
  STEALTH_KEYS_MESSAGE,
  checkStealthAddress,
  computeStealthPrivateKey,
  decodeStealthMetaAddress,
  deriveStealthKeysFromSignature,
  encodeStealthMetaAddress,
  generateStealthAddress,
  generateStealthKeys,
  getStealthMetaAddress,
  privateKeyToAddress,
  publicKeyToAddress,
  stealthMetaAddressToBytes,
  toChecksumAddress,
  type Hex,
} from '../src/index.js';

const seller = generateStealthKeys();
const sellerMeta = getStealthMetaAddress(seller);

describe('stealth addresses', () => {
  it('receiver derives the key that controls the stealth address', () => {
    for (let i = 0; i < 20; i++) {
      const { stealthAddress, ephemeralPublicKey } = generateStealthAddress(sellerMeta);
      const key = computeStealthPrivateKey(ephemeralPublicKey, seller);
      expect(viemPrivateKeyToAddress(key)).toBe(stealthAddress);
    }
  });

  it('every payment gets a different address', () => {
    const addresses = new Set(Array.from({ length: 50 }, () => generateStealthAddress(sellerMeta).stealthAddress));
    expect(addresses.size).toBe(50);
  });

  it('is deterministic for a given ephemeral key', () => {
    const eph = generatePrivateKey();
    expect(generateStealthAddress(sellerMeta, eph)).toEqual(generateStealthAddress(sellerMeta, eph));
  });

  it('owner recognises the payment with the viewing key only', () => {
    const payment = generateStealthAddress(sellerMeta);
    expect(checkStealthAddress(payment, seller.viewingKey, sellerMeta.spendingPublicKey)).toBe(true);
  });

  it('someone else does not', () => {
    const other = generateStealthKeys();
    const payment = generateStealthAddress(sellerMeta);
    expect(checkStealthAddress(payment, other.viewingKey, sellerMeta.spendingPublicKey)).toBe(false);
    expect(checkStealthAddress(payment, seller.viewingKey, getStealthMetaAddress(other).spendingPublicKey)).toBe(false);
  });

  it('rejects early on a wrong view tag', () => {
    const payment = generateStealthAddress(sellerMeta);
    const wrongTag = (payment.viewTag + 1) % 256;
    expect(checkStealthAddress({ ...payment, viewTag: wrongTag }, seller.viewingKey, sellerMeta.spendingPublicKey)).toBe(false);
  });

  it('a wrong spending key does not open the address', () => {
    const { stealthAddress, ephemeralPublicKey } = generateStealthAddress(sellerMeta);
    const wrong = computeStealthPrivateKey(ephemeralPublicKey, { ...seller, spendingKey: generatePrivateKey() });
    expect(viemPrivateKeyToAddress(wrong)).not.toBe(stealthAddress);
  });
});

describe('meta-address encoding', () => {
  it('round-trips the st: URI and registry bytes', () => {
    const uri = encodeStealthMetaAddress(sellerMeta);
    expect(uri).toMatch(/^st:arc:0x[0-9a-f]{132}$/);
    expect(decodeStealthMetaAddress(uri)).toEqual(sellerMeta);
    expect(decodeStealthMetaAddress(stealthMetaAddressToBytes(sellerMeta))).toEqual(sellerMeta);
    expect(decodeStealthMetaAddress(encodeStealthMetaAddress(sellerMeta, 'eth'))).toEqual(sellerMeta);
  });

  it('rejects malformed input', () => {
    expect(() => decodeStealthMetaAddress('st:arc:0x1234')).toThrow();
    // right length, but not points on the curve
    expect(() => decodeStealthMetaAddress(`st:arc:0x${'05'.repeat(66)}`)).toThrow();
  });
});

describe('keys from a wallet signature', () => {
  it('same wallet, same keys; keys work end to end', async () => {
    const wallet = privateKeyToAccount(generatePrivateKey());
    const sig1 = await wallet.signMessage({ message: STEALTH_KEYS_MESSAGE });
    const sig2 = await wallet.signMessage({ message: STEALTH_KEYS_MESSAGE });
    const keys = deriveStealthKeysFromSignature(sig1);
    expect(deriveStealthKeysFromSignature(sig2)).toEqual(keys);
    expect(keys.spendingKey).not.toBe(keys.viewingKey);

    const payment = generateStealthAddress(getStealthMetaAddress(keys));
    expect(viemPrivateKeyToAddress(computeStealthPrivateKey(payment.ephemeralPublicKey, keys))).toBe(payment.stealthAddress);
  });

  it('rejects a short signature', () => {
    expect(() => deriveStealthKeysFromSignature('0x1234')).toThrow();
  });
});

describe('address helpers match viem', () => {
  it('private key / public key to address', () => {
    const key = generatePrivateKey();
    const account = privateKeyToAccount(key);
    expect(privateKeyToAddress(key)).toBe(account.address);
    expect(publicKeyToAddress(account.publicKey)).toBe(account.address);
  });

  it('EIP-55 checksum', () => {
    for (let i = 0; i < 20; i++) {
      const addr = viemPrivateKeyToAddress(generatePrivateKey()).toLowerCase() as Hex;
      expect(toChecksumAddress(addr)).toBe(getAddress(addr));
    }
  });
});
