// PANSA stealth payments must be readable by other ERC-5564 wallets, and vice versa.
import { describe, expect, it } from 'vitest';
import {
  VALID_SCHEME_ID,
  checkStealthAddress as slCheck,
  computeStealthKey as slComputeKey,
  generateStealthAddress as slGenerate,
} from '@scopelift/stealth-address-sdk';
import { generatePrivateKey } from 'viem/accounts';
import {
  checkStealthAddress,
  computeStealthPrivateKey,
  encodeStealthMetaAddress,
  generateStealthAddress,
  generateStealthKeys,
  getStealthMetaAddress,
  hexToBytes,
} from '../src/index.js';

const schemeId = VALID_SCHEME_ID.SCHEME_ID_1;
const keys = generateStealthKeys();
const meta = getStealthMetaAddress(keys);
const uri = encodeStealthMetaAddress(meta, 'eth');

describe('ScopeLift stealth-address-sdk compatibility', () => {
  it('same ephemeral key, same stealth address and view tag', () => {
    for (let i = 0; i < 10; i++) {
      const eph = generatePrivateKey();
      const ours = generateStealthAddress(meta, eph);
      const theirs = slGenerate({ stealthMetaAddressURI: uri, schemeId, ephemeralPrivateKey: hexToBytes(eph) });
      expect(ours.stealthAddress.toLowerCase()).toBe(theirs.stealthAddress.toLowerCase());
      expect(ours.ephemeralPublicKey).toBe(theirs.ephemeralPublicKey);
      expect(ours.viewTag).toBe(parseInt(theirs.viewTag, 16));
    }
  });

  it('their payment, our scan + key', () => {
    const p = slGenerate({ stealthMetaAddressURI: uri, schemeId });
    const payment = { stealthAddress: p.stealthAddress, ephemeralPublicKey: p.ephemeralPublicKey, viewTag: parseInt(p.viewTag, 16) };
    expect(checkStealthAddress(payment, keys.viewingKey, meta.spendingPublicKey)).toBe(true);
    expect(computeStealthPrivateKey(p.ephemeralPublicKey, keys)).toBe(
      slComputeKey({ ephemeralPublicKey: p.ephemeralPublicKey, schemeId, spendingPrivateKey: keys.spendingKey, viewingPrivateKey: keys.viewingKey }),
    );
  });

  it('our payment, their scan', () => {
    const p = generateStealthAddress(meta);
    expect(
      slCheck({
        ephemeralPublicKey: p.ephemeralPublicKey,
        schemeId,
        spendingPublicKey: meta.spendingPublicKey,
        userStealthAddress: p.stealthAddress,
        viewingPrivateKey: keys.viewingKey,
        viewTag: `0x${p.viewTag.toString(16).padStart(2, '0')}`,
      }),
    ).toBe(true);
  });
});
