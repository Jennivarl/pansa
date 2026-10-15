/**
 * PANSA live server: a paid API that takes private x402 payments, a live demo where the
 * server's own agent buys from it, and the website.
 */
import { join, relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono, type MiddlewareHandler } from 'hono';
import { streamSSE } from 'hono/streaming';
import { createPublicClient, createWalletClient, erc20Abi, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  ARC_USDC,
  PANSA_ANNOUNCER,
  PANSA_DEPLOY_BLOCK,
  PANSA_REGISTRY,
  decodeStealthMetaAddress,
  encodeStealthMetaAddress,
  getStealthMetaAddress,
} from '@pansa/core';
import {
  CircleFacilitator,
  HEADER_PAYMENT_SIGNATURE,
  StealthSeller,
  createPayingFetch,
  sendStealthPayment,
} from '@pansa/x402';
import { JsonFilePaymentStore } from '@pansa/x402/node';
import { AnnouncementIndex } from './announcements.js';
import { API_PORT, DATA_DIR, IS_MAINNET, NET, WEB_DIST, arcChain, requireEnv, txUrl, usdc } from './env.js';

const keys = { spendingKey: requireEnv('SELLER_SPENDING_KEY'), viewingKey: requireEnv('SELLER_VIEWING_KEY') };
const apiKey = process.env.CIRCLE_API_KEY;
const meta = getStealthMetaAddress(keys);
const store = new JsonFilePaymentStore(join(DATA_DIR, 'payments.json'));

const seller = new StealthSeller({
  meta,
  viewingKey: keys.viewingKey,
  // With an API key the server never needs the spending key.
  spendingKey: apiKey ? undefined : keys.spendingKey,
  network: NET.caip2,
  facilitator: new CircleFacilitator({ apiKey }),
  store,
});

/** Mainnet prices are 10x lower: the live demo spends real money. */
const SCALE = IS_MAINNET ? 1n : 10n;
const ENDPOINTS = [
  { path: '/api/weather', amount: 1_000n * SCALE, description: 'Weather for Lagos' },
  { path: '/api/news', amount: 2_000n * SCALE, description: 'Top stablecoin headline' },
  { path: '/api/signals', amount: 5_000n * SCALE, description: 'Trading signal' },
] as const;
const priceOf = (path: string) => ENDPOINTS.find((e) => e.path === path)!;

function paid(path: (typeof ENDPOINTS)[number]['path']): MiddlewareHandler {
  return async (c, next) => {
    const { amount, description } = priceOf(path);
    const price = { amount, resource: { url: c.req.url, description, mimeType: 'application/json' } };
    const result = await seller.handle(c.req.header(HEADER_PAYMENT_SIGNATURE), price);
    if (!result.paid) {
      if (result.reply.body.error !== 'payment required') console.log(`rejected ${path}: ${result.reply.body.error}`);
      for (const [k, v] of Object.entries(result.reply.headers)) c.header(k, v);
      return c.json(result.reply.body, 402);
    }
    console.log(`paid ${path}: ${usdc(result.payment.amount)} ${txUrl(result.payment.transaction)}`);
    await next();
    for (const [k, v] of Object.entries(result.headers)) c.header(k, v);
  };
}

const app = new Hono();

app.get('/api/weather', paid('/api/weather'), (c) => c.json({ city: 'Lagos', tempC: 31, sky: 'humid, scattered storms' }));
app.get('/api/news', paid('/api/news'), (c) =>
  c.json({ headline: 'Agents now settle more payments in USDC than people do', source: 'demo' }),
);
app.get('/api/signals', paid('/api/signals'), (c) => c.json({ pair: 'BTC/USDC', signal: 'hold', confidence: 0.62 }));

// ---- live demo: the server's own agent buys from the paid API above ----

const agentKey = process.env.AGENT_PRIVATE_KEY as `0x${string}` | undefined;
const agent = agentKey ? privateKeyToAccount(agentKey) : undefined;
const chain = createPublicClient({ chain: arcChain, transport: http() });
const usdcBalance = (address: `0x${string}`) =>
  chain.readContract({ address: ARC_USDC, abi: erc20Abi, functionName: 'balanceOf', args: [address] });

const RUN_COOLDOWN_MS = 20_000;
const DAILY_RUN_CAP = Number(process.env.DEMO_DAILY_RUNS ?? 300);
const lastRunByIp = new Map<string, number>();
let runsToday = { day: '', count: 0 };
let running = 0;

function allowRun(ip: string): string | undefined {
  const day = new Date().toISOString().slice(0, 10);
  if (runsToday.day !== day) runsToday = { day, count: 0 };
  if (runsToday.count >= DAILY_RUN_CAP) return 'Daily demo limit reached. Try again tomorrow.';
  if (running >= 2) return 'Demo is busy. Try again in a few seconds.';
  const last = lastRunByIp.get(ip) ?? 0;
  if (Date.now() - last < RUN_COOLDOWN_MS) return 'One run every 20 seconds, please.';
  lastRunByIp.set(ip, Date.now());
  runsToday.count++;
  return undefined;
}

app.get('/api/info', async (c) => {
  const payments = await store.list();
  return c.json({
    network: NET.caip2,
    networkName: NET.name,
    explorerUrl: NET.explorerUrl,
    rpcUrl: arcChain.rpcUrls.default.http[0],
    chainId: NET.id,
    mainnet: IS_MAINNET,
    contracts: { usdc: ARC_USDC, announcer: PANSA_ANNOUNCER, registry: PANSA_REGISTRY },
    sellerStealthId: encodeStealthMetaAddress(meta),
    agent: agent?.address ?? null,
    endpoints: ENDPOINTS.map((e) => ({ path: e.path, amount: e.amount.toString(), description: e.description })),
    // Totals only. Listing the addresses would link them to this seller.
    stats: {
      payments: payments.length,
      volume: payments.reduce((sum, p) => sum + BigInt(p.amount), 0n).toString(),
    },
  });
});

app.get('/api/demo/run', (c) => {
  if (!agent) return c.json({ error: 'demo agent not configured' }, 503);
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const refused = allowRun(ip);
  if (refused) return c.json({ error: refused }, 429);

  return streamSSE(c, async (stream) => {
    running++;
    try {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      const before = await usdcBalance(agent.address);
      await send('start', { agent: agent.address, balance: before.toString() });

      let current: { payTo?: string; transaction?: string } = {};
      const payingFetch = createPayingFetch({
        account: agent,
        networks: [NET.caip2],
        maxAmount: 100_000n,
        // Calls this same app in-process: no network hop to ourselves.
        fetch: (input, init) => Promise.resolve(app.request(input instanceof Request ? input : String(input), init)),
        onPayment: ({ requirements, settlement }) => {
          current = { payTo: requirements.payTo, transaction: settlement?.transaction };
        },
      });

      for (const e of ENDPOINTS) {
        current = {};
        await send('step', { path: e.path, amount: e.amount.toString(), status: 'paying' });
        const res = await payingFetch(`http://pansa.internal${e.path}`);
        const body = await res.json().catch(() => null);
        await send('step', {
          path: e.path,
          amount: e.amount.toString(),
          status: res.ok ? 'paid' : 'failed',
          payTo: current.payTo,
          transaction: current.transaction,
          data: res.ok ? body : undefined,
          error: res.ok ? undefined : (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
        });
      }

      const after = await usdcBalance(agent.address);
      await send('done', { spent: (before - after).toString(), balance: after.toString() });
    } catch (err) {
      await stream.writeSSE({ event: 'fail', data: JSON.stringify({ error: (err as Error).message }) });
    } finally {
      running--;
    }
  });
});

// ---- Mode B: the agent pays a stealth ID directly and announces it on-chain ----

const announcements = new AnnouncementIndex(
  chain,
  PANSA_ANNOUNCER,
  PANSA_DEPLOY_BLOCK[NET.id] ?? 0n,
  join(DATA_DIR, 'announcements.json'),
);
void announcements.start();

/** Every announcement: the browser matches them with a viewing key it never sends us. */
app.get('/api/announcements', (c) => c.json(announcements.list()));

const PAY_ME_AMOUNT = 1_000n * SCALE;
const PAY_ME_COOLDOWN_MS = 60_000;
const lastPayMeByIp = new Map<string, number>();
let payMeToday = { day: '', count: 0 };

app.post('/api/demo/pay-me', async (c) => {
  if (!agent) return c.json({ error: 'demo agent not configured' }, 503);
  const { stealthId } = await c.req.json<{ stealthId?: string }>().catch(() => ({ stealthId: undefined }));
  let target;
  try {
    target = decodeStealthMetaAddress(stealthId ?? '');
  } catch {
    return c.json({ error: 'invalid stealth ID' }, 400);
  }

  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const day = new Date().toISOString().slice(0, 10);
  if (payMeToday.day !== day) payMeToday = { day, count: 0 };
  if (payMeToday.count >= DAILY_RUN_CAP) return c.json({ error: 'Daily demo limit reached. Try again tomorrow.' }, 429);
  if (Date.now() - (lastPayMeByIp.get(ip) ?? 0) < PAY_ME_COOLDOWN_MS) {
    return c.json({ error: 'One test payment a minute, please.' }, 429);
  }
  lastPayMeByIp.set(ip, Date.now());
  payMeToday.count++;

  try {
    const wallet = createWalletClient({ account: agent, chain: arcChain, transport: http() });
    const result = await sendStealthPayment({ wallet, publicClient: chain, meta: target, amount: PAY_ME_AMOUNT });
    await announcements.sync();
    console.log(`pay-me: ${usdc(PAY_ME_AMOUNT)} -> ${result.stealthAddress} ${txUrl(result.transferTx)}`);
    return c.json({ amount: PAY_ME_AMOUNT.toString(), ...result });
  } catch (err) {
    console.error('pay-me failed:', (err as Error).message);
    return c.json({ error: 'Payment failed. Try again in a minute.' }, 502);
  }
});

// ---- website ----
// serveStatic resolves root against the working directory.
const STATIC_ROOT = relative(process.cwd(), WEB_DIST) || '.';
app.use('/*', serveStatic({ root: STATIC_ROOT }));
app.get('*', serveStatic({ root: STATIC_ROOT, path: 'index.html' }));

serve({ fetch: app.fetch, port: API_PORT }, ({ port }) => {
  console.log(`PANSA on http://localhost:${port}  ${NET.name}  (${apiKey ? 'Circle API key' : 'Circle keyless trial'})`);
  if (!agent) console.log('No AGENT_PRIVATE_KEY: live demo disabled.');
});
