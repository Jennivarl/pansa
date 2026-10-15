import { useEffect, useState } from 'react';
import { getInfo, runDemo, short, usd, type Info, type Step } from './api';

const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined;
const SELF_GAS_PROOF =
  'https://explorer.testnet.arc.io/tx/0x50791d14ae7f85451adf061d41e72e4be1046dd6971aab559c667c1f8209b13b';

export function App() {
  const [info, setInfo] = useState<Info | null>(null);
  const refresh = () => getInfo().then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <header className="nav wrap">
        <a className="logo" href="#top">
          <Mark /> PANSA
        </a>
        <nav>
          <a href="#demo">Live demo</a>
          <a href="#how">How it works</a>
          <a href="#why-arc">Why Arc</a>
          <a href="#build">Build</a>
          <a href="/dashboard">Dashboard</a>
          {REPO_URL && <a href={REPO_URL}>GitHub</a>}
        </nav>
      </header>

      <main id="top">
        <section className="hero wrap">
          <p className="eyebrow">x402 · stealth addresses · Arc</p>
          <h1>
            Private payments
            <br />
            for AI agents.
          </h1>
          <p className="lede">
            Agents pay for data and tools in USDC, and every payment is public. PANSA sends each one to a fresh
            one-time address that only the seller can open. The explorer can't tell who got paid.
          </p>
          <div className="cta">
            <a className="btn primary" href="#demo">
              Run the live demo
            </a>
            <a className="btn" href="#build">
              Add it to your API
            </a>
          </div>
          {info && (
            <p className="stats">
              <span>
                <b>{info.stats.payments}</b> private payments
              </span>
              <span>
                <b>{usd(info.stats.volume)}</b> settled
              </span>
              <span className={info.mainnet ? 'net main' : 'net'}>{info.networkName}</span>
            </p>
          )}
        </section>

        <LiveDemo info={info} onFinished={refresh} />

        <section id="how" className="wrap section">
          <h2>How it works</h2>
          <ol className="steps">
            <li>
              <b>Agent calls a paid API.</b>
              <span>Any x402 agent, no changes needed.</span>
            </li>
            <li>
              <b>API answers “402: pay first”</b>
              <span>with a one-time address made just for this request from the seller's public stealth ID.</span>
            </li>
            <li>
              <b>Agent signs a USDC payment.</b>
              <span>Circle's x402 Facilitator puts it on Arc and pays the gas.</span>
            </li>
            <li>
              <b>Seller opens it later.</b>
              <span>
                Its viewing key finds the payment, its spending key unlocks the address. Nobody else can link the
                two.
              </span>
            </li>
          </ol>
        </section>

        <section id="why-arc" className="wrap section">
          <h2>Why Arc</h2>
          <div className="cards">
            <article>
              <h3>USDC is the gas</h3>
              <p>
                Elsewhere a one-time address holds tokens but no ETH to move them, and topping it up links it to its
                owner. On Arc, the USDC it received pays its own fee. No relayer, no link.
              </p>
              <a href={SELF_GAS_PROOF}>See it on-chain: a one-time address paying $0.0018 gas from its own USDC →</a>
            </article>
            <article>
              <h3>Where agents pay</h3>
              <p>Circle's x402 Facilitator, Agent Wallets and Nanopayments run on Arc. PANSA plugs into them as-is.</p>
            </article>
            <article>
              <h3>Instant, final</h3>
              <p>Payments settle in under a second and can't be reorged, so an API can serve the response right away.</p>
            </article>
            <article>
              <h3>Ready for Arc Privacy</h3>
              <p>
                Today PANSA hides <em>who</em> gets paid. When Arc's privacy layer ships, amounts get hidden too, with
                view keys for auditors.
              </p>
            </article>
          </div>
        </section>

        <section id="build" className="wrap section">
          <h2>Add it to your API</h2>
          <div className="code-grid">
            <div>
              <p className="label">Seller: a few lines in front of any route</p>
              <pre>
                <code>{SELLER_SNIPPET}</code>
              </pre>
            </div>
            <div>
              <p className="label">Agent: a fetch that pays, within a budget</p>
              <pre>
                <code>{AGENT_SNIPPET}</code>
              </pre>
            </div>
          </div>
          <p className="note">
            Standard ERC-5564 stealth addresses, tested against ScopeLift's SDK, so any compatible wallet can find
            PANSA payments. Registry (ERC-6538) and announcer contracts have no owner and hold no funds.
          </p>
        </section>

        <section className="wrap section">
          <h2>Roadmap</h2>
          <div className="roadmap">
            <div>
              <span className="tag now">Now</span>
              <p>Hidden receivers for x402 on Arc. Seller add-on, paying fetch for agents, live demo.</p>
            </div>
            <div>
              <span className="tag">Next</span>
              <p>Agents paying straight to a registered stealth ID, seller SDK on npm, announcements for x402 payments.</p>
            </div>
            <div>
              <span className="tag">Arc Privacy</span>
              <p>Hidden amounts and selective disclosure with view keys, on top of the same stealth addresses.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="wrap foot">
        <span>
          <Mark /> PANSA: private payments for agents on Arc
        </span>
        <span>
          Non-custodial. No owner keys. {REPO_URL && <a href={REPO_URL}>Source</a>}
        </span>
      </footer>
    </>
  );
}

function LiveDemo({ info, onFinished }: { info: Info | null; onFinished: () => void }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [spent, setSpent] = useState<string | null>(null);

  const explorer = info?.explorerUrl ?? 'https://explorer.testnet.arc.io';
  const total = info?.endpoints.reduce((s, e) => s + Number(e.amount), 0) ?? 0;

  async function start() {
    if (!info) return;
    setState('running');
    setMessage('');
    setSpent(null);
    setSteps(info.endpoints.map((e) => ({ path: e.path, amount: e.amount, status: 'waiting' })));
    try {
      await runDemo((e) => {
        if (e.event === 'step') setSteps((prev) => prev.map((s) => (s.path === e.data.path ? e.data : s)));
        if (e.event === 'done') setSpent(e.data.spent);
        if (e.event === 'fail') throw new Error(e.data.error);
      });
      setState('done');
      onFinished();
    } catch (err) {
      setState('error');
      setMessage((err as Error).message);
    }
  }

  const paidSteps = steps.filter((s) => s.payTo);
  const shown: Step[] = steps.length
    ? steps
    : (info?.endpoints ?? []).map((e) => ({ path: e.path, amount: e.amount, status: 'waiting' }));

  return (
    <section id="demo" className="wrap section">
      <h2>Live demo</h2>
      <p className="sub">
        Our agent buys three things from a paid API, for real, on {info?.networkName ?? 'Arc'}. Watch where the
        money goes.
      </p>

      <div className="demo">
        <div className="panel">
          <div className="panel-head">
            <span>Agent {info?.agent ? <a href={`${explorer}/address/${info.agent}`}>{short(info.agent)}</a> : '—'}</span>
            <button className="btn primary" onClick={start} disabled={!info?.agent || state === 'running'}>
              {state === 'running' ? 'Paying…' : `Run agent (${usd(String(total))})`}
            </button>
          </div>
          <ul className="calls">
            {shown.map(
              (s) => (
                <li key={s.path} className={s.status}>
                  <div className="call-line">
                    <code>GET {s.path}</code>
                    <span className="price">{usd(s.amount)}</span>
                    <span className="status">{label(s.status)}</span>
                  </div>
                  {s.payTo && (
                    <div className="call-detail">
                      paid to one-time address <a href={`${explorer}/address/${s.payTo}`}>{short(s.payTo)}</a>
                      {s.transaction && (
                        <>
                          {' · '}
                          <a href={`${explorer}/tx/${s.transaction}`}>tx</a>
                        </>
                      )}
                    </div>
                  )}
                  {s.data != null && <pre className="response">{JSON.stringify(s.data)}</pre>}
                  {s.error && <div className="call-error">{s.error}</div>}
                </li>
              ),
            )}
          </ul>
          {spent && <p className="done">Spent {usd(spent, 4)}. Three payments, three unrelated addresses.</p>}
          {state === 'error' && <p className="call-error">{message}</p>}
          {!info && <p className="muted">Connecting to the demo server…</p>}
          {info && !info.agent && <p className="muted">The demo agent isn't configured on this server.</p>}
        </div>

        <div className="compare">
          <div className="side">
            <h3>Normal x402</h3>
            <p className="muted">What the explorer shows</p>
            <ul className="flow">
              {(info?.endpoints ?? []).map((e) => usd(e.amount)).map((a, i) => (
                <li key={i}>
                  <span>agent</span>
                  <span className="arrow">→</span>
                  <span className="same">seller-wallet</span>
                  <span className="amt">{a}</span>
                </li>
              ))}
            </ul>
            <p className="verdict bad">Anyone can add up the seller's income, list its customers, and copy the agent's suppliers.</p>
          </div>
          <div className="side">
            <h3>With PANSA</h3>
            <p className="muted">What the explorer shows</p>
            <ul className="flow">
              {[0, 1, 2].map((i) => {
                const s = paidSteps[i];
                return (
                  <li key={i}>
                    <span>agent</span>
                    <span className="arrow">→</span>
                    {s?.payTo ? (
                      <a className="fresh" href={`${explorer}/address/${s.payTo}`}>
                        {short(s.payTo)}
                      </a>
                    ) : (
                      <span className="fresh pending">0x····…····</span>
                    )}
                    <span className="amt">{s ? usd(s.amount) : ''}</span>
                  </li>
                );
              })}
            </ul>
            <p className="verdict good">Unrelated one-time addresses. Only the seller's viewing key connects them.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function label(status: Step['status']) {
  return { waiting: 'waiting', paying: 'paying…', paid: 'paid ✓', failed: 'failed' }[status];
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="5 4" />
      <circle cx="16" cy="16" r="3.5" fill="currentColor" />
    </svg>
  );
}

const SELLER_SNIPPET = `import { StealthSeller, CircleFacilitator } from '@pansa/x402';

const seller = new StealthSeller({
  meta,                 // your public stealth ID
  viewingKey,           // finds payments; can't spend
  network: 'eip155:5042',
  facilitator: new CircleFacilitator({ apiKey }),
});

const r = await seller.handle(req.headers['payment-signature'], {
  amount: 10_000n,      // $0.01
  resource: { url: req.url },
});
if (!r.paid) return reply(402, r.reply);
serve(data);`;

const AGENT_SNIPPET = `import { createPayingFetch } from '@pansa/x402';

const pay = createPayingFetch({
  account,              // agent wallet
  networks: ['eip155:5042'],
  maxAmount: 100_000n,  // never more than $0.10 a call
});

const res = await pay('https://api.example/signals');`;
