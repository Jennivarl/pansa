const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(text: string): string {
  let binary = '';
  for (const b of encoder.encode(text)) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Standard base64 of JSON, as used by the x402 HTTP headers. */
export function encodeHeader(value: unknown): string {
  return toBase64(JSON.stringify(value));
}

/** Accepts standard or URL-safe base64, padded or not. */
export function decodeHeader<T>(value: string): T {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return JSON.parse(decoder.decode(bytes)) as T;
}

export function base64UrlEncode(text: string): string {
  return toBase64(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function chainIdFromCaip2(network: string): number {
  const match = /^eip155:(\d+)$/.exec(network);
  if (!match) throw new Error(`unsupported network: ${network}`);
  return Number(match[1]);
}
