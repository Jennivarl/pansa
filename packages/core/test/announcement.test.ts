import { describe, expect, it } from 'vitest';
import { privateKeyToAddress as viemPrivateKeyToAddress } from 'viem/accounts';
import {
  NATIVE_SELECTOR,
  NATIVE_TOKEN,
  SCHEME_ID,
  TRANSFER_WITH_AUTHORIZATION_SELECTOR,
  decodeAnnouncementMetadata,
  encodeAnnouncementMetadata,
  generateStealthAddress,
  generateStealthKeys,
  getStealthMetaAddress,
  scanAnnouncements,
  type Announcement,
  type Hex,
} from '../src/index.js';

const USDC: Hex = '0x3600000000000000000000000000000000000000';

function announce(meta: ReturnType<typeof getStealthMetaAddress>, amount: bigint): Announcement {
  const p = generateStealthAddress(meta);
  return {
    schemeId: SCHEME_ID,
    stealthAddress: p.stealthAddress,
    caller: '0x0000000000000000000000000000000000000001',
    ephemeralPublicKey: p.ephemeralPublicKey,
    metadata: encodeAnnouncementMetadata({
      viewTag: p.viewTag,
      selector: TRANSFER_WITH_AUTHORIZATION_SELECTOR,
      token: USDC,
      amount,
    }),
  };
}

describe('announcement metadata', () => {
  it('round-trips', () => {
    const meta = { viewTag: 0xab, selector: TRANSFER_WITH_AUTHORIZATION_SELECTOR, token: USDC, amount: 1_250_000n };
    const encoded = encodeAnnouncementMetadata(meta);
    expect(encoded.length).toBe(2 + 57 * 2);
    expect(decodeAnnouncementMetadata(encoded)).toEqual(meta);
  });

  it('accepts view-tag-only metadata', () => {
    expect(decodeAnnouncementMetadata('0x7f')).toEqual({
      viewTag: 0x7f,
      selector: '0x00000000',
      token: '0x0000000000000000000000000000000000000000',
      amount: 0n,
    });
  });

  it('encodes native transfers with the 0xee markers', () => {
    const decoded = decodeAnnouncementMetadata(
      encodeAnnouncementMetadata({ viewTag: 1, selector: NATIVE_SELECTOR, token: NATIVE_TOKEN, amount: 10n ** 18n }),
    );
    expect(decoded.token).toBe(NATIVE_TOKEN);
    expect(decoded.selector).toBe(NATIVE_SELECTOR);
  });

  it('rejects bad fields', () => {
    expect(() => encodeAnnouncementMetadata({ viewTag: 256, selector: NATIVE_SELECTOR, token: USDC, amount: 0n })).toThrow();
    expect(() => encodeAnnouncementMetadata({ viewTag: 1, selector: '0x01', token: USDC, amount: 0n })).toThrow();
  });
});

describe('scanAnnouncements', () => {
  const me = generateStealthKeys();
  const myMeta = getStealthMetaAddress(me);

  const noise = Array.from({ length: 60 }, () => announce(getStealthMetaAddress(generateStealthKeys()), 1n));
  const mine = [announce(myMeta, 10_000n), announce(myMeta, 20_000n), announce(myMeta, 30_000n)];
  const garbage: Announcement = { ...mine[0], ephemeralPublicKey: '0x02deadbeef', metadata: '0x' };
  const otherScheme: Announcement = { ...mine[0], schemeId: 2n };
  const all = [...noise.slice(0, 20), mine[0], garbage, ...noise.slice(20, 40), mine[1], otherScheme, ...noise.slice(40), mine[2]];

  it('watch-only scan finds exactly our payments, no spend keys', () => {
    const found = scanAnnouncements(all, { viewingKey: me.viewingKey, spendingPublicKey: myMeta.spendingPublicKey });
    expect(found.map((f) => f.stealthAddress)).toEqual(mine.map((m) => m.stealthAddress));
    expect(found.map((f) => f.amount)).toEqual([10_000n, 20_000n, 30_000n]);
    expect(found.every((f) => f.stealthPrivateKey === undefined)).toBe(true);
  });

  it('full scan returns keys that control each address', () => {
    const found = scanAnnouncements(all, {
      viewingKey: me.viewingKey,
      spendingPublicKey: myMeta.spendingPublicKey,
      spendingKey: me.spendingKey,
    });
    expect(found).toHaveLength(3);
    for (const f of found) expect(viemPrivateKeyToAddress(f.stealthPrivateKey!)).toBe(f.stealthAddress);
  });
});
