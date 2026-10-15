import { useEffect, useState, type ReactNode } from 'react';
import { getInfo, runDemo, short, usd, type Info, type Step } from './api';
import { HeroVisual } from './HeroVisual';
import { Logo } from './Logo';

const REPO_URL = import.meta.env.VITE_REPO_URL as string | undefined;
const SELF_GAS_PROOF =
  'https://explorer.arc.io/tx/0xc93e94cb3e7ebb859a37deb888061bb7cc731ef5146c339e0596e04483f71b35';

export function App() {
  const [info, setInfo] = useState<Info | null>(null);
  const refresh = () => getInfo().then(setInfo).catch(() => setInfo(null));
  useEffect(() => {
    refresh();
  }, []);

  return (
    <>
      <div className="aurora" aria-hidden="true" />
      <header className="nav wrap">
        <a className="logo" href="#top" aria-label="PANSA home">
          <Logo />
        </a>
        <nav>
          <a href="#demo">Live demo</a>
          <a href="#how">How it works</a>
          <a href="#why-arc">Why Arc</a>
          <a href="#build">Build</a>
          {REPO_URL && <a href={REPO_URL}>GitHub</a>}
          <a className="btn small nav-cta" href="/dashboard">
            Dashboard
          </a>
        </nav>
      </header>

      <main id="top">
        <section className="hero wrap">
          <div className="hero-copy">
            {info && (
              <p className="pill">
                <span className="pulse" /> Live on {info.mainnet ? 'Arc mainnet' : info.networkName}
              </p>
            )}
            <h1>
              Private payments
              <br />
              for <span className="grad">AI agents.</span>
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
            <ul className="facts">
              <li>x402 + Circle Facilitator</li>
              <li>ERC-5564 stealth addresses</li>
              <li>Non-custodial</li>
            </ul>
          </div>
          <HeroVisual />
        </section>

        <LiveDemo info={info} onFinished={refresh} />

        <section id="how" className="wrap section">
          <SectionHead eyebrow="How it works" title="Four steps, nothing to change for agents" />
          <ol className="steps">
            <li>
              <b>Agent calls a paid API.</b>
              <span>Any x402 agent works as is.</span>
            </li>
            <li>
              <b>API answers “402: pay first”</b>
              <span>with a one-time address made for this request from the seller's public stealth ID.</span>
            </li>
            <li>
              <b>Agent signs a USDC payment.</b>
              <span>Circle's x402 Facilitator settles it on Arc and pays the gas.</span>
            </li>
            <li>
              <b>Seller opens it later.</b>
              <span>The viewing key finds it, the spending key unlocks it. Nobody else can link the two.</span>
            </li>
          </ol>
        </section>

        <section id="why-arc" className="wrap section">
          <SectionHead eyebrow="Why Arc" title="The chain where stealth addresses just work" />
          <div className="cards">
            <Card icon={<IconFuel />} title="USDC is the gas" wide>
              <p>
                Elsewhere a one-time address holds tokens but no ETH to move them, and topping it up links it to its
                owner. On Arc, the USDC it received pays its own fee. No relayer, no link.
              </p>
              <a href={SELF_GAS_PROOF}>On mainnet: a one-time address paying $0.0015 gas from its own USDC →</a>
            </Card>
            <Card icon={<IconPlug />} title="Where agents pay">
              <p>Circle's x402 Facilitator, Agent Wallets and Nanopayments run on Arc. PANSA plugs into them as is.</p>
            </Card>
            <Card icon={<IconBolt />} title="Instant, final">
              <p>Payments settle in under a second and can't be reorged, so an API can answer right away.</p>
            </Card>
            <Card icon={<IconEye />} title="Ready for Arc Privacy">
              <p>
                Today PANSA hides <em>who</em> gets paid. When Arc's privacy layer ships, amounts get hidden too, with
                view keys for auditors.
              </p>
            </Card>
          </div>
        </section>

        <section id="build" className="wrap section">
          <SectionHead eyebrow="Build" title="A few lines on each side" />
          <div className="code-grid">
            <CodeWindow file="server.ts" label="Seller: in front of any route" code={SELLER_SNIPPET} />
            <CodeWindow file="agent.ts" label="Agent: a fetch that pays, within a budget" code={AGENT_SNIPPET} />
          </div>
          <p className="note">
            Standard ERC-5564 stealth addresses, tested against ScopeLift's SDK, so any compatible wallet can find
            PANSA payments. The registry (ERC-6538) and announcer contracts have no owner and hold no funds.
          </p>
        </section>

        <section className="wrap section">
          <SectionHead eyebrow="Roadmap" title="Hidden receivers today, hidden amounts next" />
          <ol className="timeline">
            <li className="done">
              <span className="tag now">Now</span>
              <p>Hidden receivers for x402 on Arc, verified payee, pay-by-address, on-chain announcements, seller dashboard.</p>
            </li>
            <li>
              <span className="tag">Next</span>
              <p>SDK on npm, so any x402 API or agent can add private payments.</p>
            </li>
            <li>
              <span className="tag">Arc Privacy</span>
              <p>Hidden amounts and selective disclosure with view keys, on the same stealth addresses.</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="wrap foot">
        <Logo />
        <span>
          Private payments for AI agents on Arc · Non-custodial{REPO_URL && <> · <a href={REPO_URL}>Source</a></>}
        </span>
      </footer>
    </>
  );
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="section-head">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
    </div>
  );
}

function Card({ icon, title, wide, children }: { icon: ReactNode; title: string; wide?: boolean; children: ReactNode }) {
  return (
    <article className={wide ? 'card wide' : 'card'}>
      <span className="card-icon">{icon}</span>
      <h3>{title}</h3>
      {children}
    </article>
  );
}

function CodeWindow({ file, label, code }: { file: string; label: string; code: string }) {
  return (
    <div className="code-window">
      <p className="label">{label}</p>
      <div className="window">
        <div className="window-bar">
          <span />
          <span />
          <span />
          <em>{file}</em>
        </div>
        <pre>
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const IconFuel = () => icon('M4 20V6a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v14M3 20h12M14 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3M7 8h4');
const IconPlug = () => icon('M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0V8zM12 17v4');
const IconBolt = () => icon('M13 2 4 14h7l-1 8 9-12h-7l1-8z');
const IconEye = () => icon('M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');

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
      <SectionHead eyebrow="Live demo" title="Watch an agent pay, for real" />
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
