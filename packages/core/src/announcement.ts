/**
 * ERC-5564 announcement metadata and scanning.
 *
 * metadata layout (scheme 1):
 *   [0]      view tag
 *   [1..4]   function selector  (0xeeeeeeee for native transfers)
 *   [5..24]  token address      (0xeeee…eeee for native transfers)
 *   [25..56] amount             (uint256)
 */
import { bigIntToBytes, bytesToBigInt, bytesToHex, concatBytes, hexToBytes, toChecksumAddress, type Hex } from './bytes.js';
import { checkStealthAddress, computeStealthPrivateKey, SCHEME_ID, type StealthKeys } from './stealth.js';

export const NATIVE_SELECTOR: Hex = '0xeeeeeeee';
export const NATIVE_TOKEN: Hex = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
/** transfer(address,uint256) */
export const ERC20_TRANSFER_SELECTOR: Hex = '0xa9059cbb';
/** transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32) — EIP-3009, used by x402 */
export const TRANSFER_WITH_AUTHORIZATION_SELECTOR: Hex = '0xe3ee160e';

export interface AnnouncementMetadata {
  viewTag: number;
  selector: Hex;
  token: Hex;
  amount: bigint;
}

/** Shape of an ERC5564Announcer `Announcement` event. */
export interface Announcement {
  schemeId: bigint;
  stealthAddress: Hex;
  caller: Hex;
  ephemeralPublicKey: Hex;
  metadata: Hex;
}

export interface ScannedPayment extends AnnouncementMetadata {
  stealthAddress: Hex;
  ephemeralPublicKey: Hex;
  /** Only set when spending keys were passed to scanAnnouncements. */
  stealthPrivateKey?: Hex;
}

export function encodeAnnouncementMetadata(meta: AnnouncementMetadata): Hex {
  if (!Number.isInteger(meta.viewTag) || meta.viewTag < 0 || meta.viewTag > 255) throw new Error('invalid view tag');
  const selector = hexToBytes(meta.selector);
  const token = hexToBytes(meta.token);
  if (selector.length !== 4) throw new Error('selector must be 4 bytes');
  if (token.length !== 20) throw new Error('token must be 20 bytes');
  return bytesToHex(concatBytes(Uint8Array.of(meta.viewTag), selector, token, bigIntToBytes(meta.amount, 32)));
}

export function decodeAnnouncementMetadata(metadata: Hex): AnnouncementMetadata {
  const bytes = hexToBytes(metadata);
  if (bytes.length < 1) throw new Error('metadata missing view tag');
  // Senders may announce only the view tag; the rest is optional.
  const padded = bytes.length >= 57 ? bytes : concatBytes(bytes, new Uint8Array(57 - bytes.length));
  return {
    viewTag: padded[0],
    selector: bytesToHex(padded.slice(1, 5)),
    token: toChecksumAddress(bytesToHex(padded.slice(5, 25))),
    amount: bytesToBigInt(padded.slice(25, 57)),
  };
}

/**
 * Finds the announcements addressed to us. With only the viewing key (plus the spending
 * public key) this is a read-only "watch" scan; pass full keys to also get spend keys.
 */
export function scanAnnouncements(
  announcements: Announcement[],
  viewer: { viewingKey: Hex; spendingPublicKey: Hex; spendingKey?: Hex },
): ScannedPayment[] {
  const found: ScannedPayment[] = [];
  for (const a of announcements) {
    if (a.schemeId !== SCHEME_ID) continue;
    let meta: AnnouncementMetadata;
    try {
      meta = decodeAnnouncementMetadata(a.metadata);
    } catch {
      continue;
    }
    const payment = { stealthAddress: a.stealthAddress, ephemeralPublicKey: a.ephemeralPublicKey, viewTag: meta.viewTag };
    let ours = false;
    try {
      ours = checkStealthAddress(payment, viewer.viewingKey, viewer.spendingPublicKey);
    } catch {
      // Malformed ephemeral key in someone else's announcement.
    }
    if (!ours) continue;
    const keys: StealthKeys | undefined = viewer.spendingKey
      ? { spendingKey: viewer.spendingKey, viewingKey: viewer.viewingKey }
      : undefined;
    found.push({
      ...meta,
      stealthAddress: a.stealthAddress,
      ephemeralPublicKey: a.ephemeralPublicKey,
      stealthPrivateKey: keys ? computeStealthPrivateKey(a.ephemeralPublicKey, keys) : undefined,
    });
  }
  return found;
}
