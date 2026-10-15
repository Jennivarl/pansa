export interface Info {
  network: string;
  networkName: string;
  explorerUrl: string;
  rpcUrl: string;
  chainId: number;
  mainnet: boolean;
  contracts: { usdc: `0x${string}`; announcer: `0x${string}`; registry: `0x${string}` };
  sellerStealthId: string;
  agent: string | null;
  endpoints: { path: string; amount: string; description: string }[];
  testPaymentAmount: string;
  stats: { payments: number; volume: string };
}

export interface Step {
  path: string;
  amount: string;
  status: 'waiting' | 'paying' | 'paid' | 'failed';
  payTo?: string;
  transaction?: string;
  data?: unknown;
  error?: string;
}

export type RunEvent =
  | { event: 'start'; data: { agent: string; balance: string } }
  | { event: 'step'; data: Step }
  | { event: 'done'; data: { spent: string; balance: string } }
  | { event: 'fail'; data: { error: string } };

export async function getInfo(): Promise<Info> {
  const res = await fetch('/api/info');
  if (!res.ok) throw new Error(`info: HTTP ${res.status}`);
  return res.json();
}

/** Runs the live demo, streaming server-sent events. */
export async function runDemo(onEvent: (e: RunEvent) => void): Promise<void> {
  const res = await fetch('/api/demo/run');
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let event = 'message';
      let data = '';
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (data) onEvent({ event, data: JSON.parse(data) } as RunEvent);
    }
  }
}

export const usd = (atomic: string | bigint, digits = 3) => `$${(Number(atomic) / 1e6).toFixed(digits)}`;
export const short = (hex: string) => `${hex.slice(0, 6)}…${hex.slice(-4)}`;
