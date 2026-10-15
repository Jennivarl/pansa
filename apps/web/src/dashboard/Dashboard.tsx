import { useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom, erc20Abi, isAddress, parseUnits, type Hex } from 'viem';
import {
  STEALTH_KEYS_MESSAGE,
  SCHEME_ID,
  deriveStealthKeysFromSignature,
  encodeStealthMetaAddress,
  getStealthMetaAddress,
  stealthMetaAddressToBytes,
  type StealthKeys,
} from '@pansa/core';
import { REGISTRY_ABI, lookupStealthId, registrationTypedData } from '@pansa/x402';
import { getInfo, short, usd, type Info } from '../api';
import { arcChainFrom, publicClientFor } from './chain';
import { findPayments, spendFromStealthAddress, type FoundPayment } from './payments';
import { useWallet } from './wallet';

export function Dashboard() {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    getInfo().then(setInfo).catch(() => setInfo(null));
  }, []);
  const wallet = useWallet();
  const chain = useMemo(() => (info ? arcChainFrom(info) : null), [info]);
  const client = useMemo(() => (chain ? publicClientFor(chain) : null), [chain]);

  const [keys, setKeys] = useState<StealthKeys | null>(null);
  const [keyWarning, setKeyWarning] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [payments, setPayments] = useState<FoundPayment[] | null>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [testPayment, setTestPayment] = useState<{ stealthAddress: string; transferTx: string } | null>(null);

  // Keys belong to whoever signed; forget them when the wallet changes.
  useEffect(() => {
    setKeys(null);
    setPayments(null);
    setRegistered(null);
  }, [wallet.address]);

  const explorer = info?.explorerUrl ?? '';
  const stealthId = keys ? encodeStealthMetaAddress(getStealthMetaAddress(keys)) : '';

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError('');
    try {
      return await fn();
    } catch (err) {
      setError(friendly(err));
      return undefined;
    } finally {
      setBusy('');
    }
  }

  async function unlock() {
    await run('Waiting for your signature…', async () => {
      const sig1 = await wallet.signMessage(STEALTH_KEYS_MESSAGE);
      const derived = deriveStealthKeysFromSignature(sig1);
      // Recovery depends on the wallet signing the same way every time.
      const sig2 = await wallet.signMessage(STEALTH_KEYS_MESSAGE);
      setKeyWarning(
        sig1 === sig2
          ? ''
          : "This wallet doesn't sign deterministically, so these keys can't be recovered later. Save them before receiving real money.",
      );
      setKeys(derived);
      await refresh(derived);
    });
  }

  async function refresh(k = keys) {
    if (!k || !client || !info || !wallet.address) return;
    await run('Scanning Arc for your payments…', async () => {
      const [found, onRegistry, bal] = await Promise.all([
        findPayments(k, client, info.contracts.usdc),
        lookupStealthId(client, wallet.address!, info.contracts.registry).catch(() => undefined),
        client.readContract({ address: info.contracts.usdc, abi: erc20Abi, functionName: 'balanceOf', args: [wallet.address!] }),
      ]);
      setPayments(found);
      setRegistered(
        !!onRegistry && stealthMetaAddressToBytes(onRegistry) === stealthMetaAddressToBytes(getStealthMetaAddress(k)),
      );
      setWalletBalance(bal);
    });
  }

  async function requestTestPayment() {
    await run('Our agent is paying you (two transactions, a few seconds)…', async () => {
      const res = await fetch('/api/demo/pay-me', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ stealthId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setTestPayment(body);
    });
    await refresh();
  }

  async function register() {
    if (!keys || !chain || !client || !wallet.provider || !wallet.address) return;
    const meta = getStealthMetaAddress(keys);
    const walletClient = createWalletClient({ account: wallet.address, chain, transport: custom(wallet.provider) });
    await run('Registering your stealth ID…', async () => {
      await wallet.switchChain?.(chain.id);
      if (walletBalance && walletBalance > 0n) {
        const hash = await walletClient.writeContract({
          address: info!.contracts.registry,
          abi: REGISTRY_ABI,
          functionName: 'registerKeys',
          args: [SCHEME_ID, stealthMetaAddressToBytes(meta)],
        });
        await client.waitForTransactionReceipt({ hash });
        return;
      }
      // No USDC for the fee: sign the registration, our demo agent submits it.
      const typed = await registrationTypedData({
        publicClient: client,
        registrant: wallet.address!,
        meta,
        chainId: chain.id,
        registry: info!.contracts.registry,
      });
      const signature = await walletClient.signTypedData({ account: wallet.address!, ...typed });
      const res = await fetch('/api/demo/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ registrant: wallet.address, signature, stealthId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    });
    await refresh();
  }

  if (!wallet.ready || !info) return <Shell><p className="muted">Loading…</p></Shell>;

  if (!wallet.address) {
    return (
      <Shell>
        <div className="panel dash-card">
          <h2>Seller dashboard</h2>
          <p className="sub">
            See and spend the private payments sent to you. Your keys are made from a wallet signature, right here in
            your browser. They never reach our server.
          </p>
          <button className="btn primary" onClick={wallet.login}>
            {wallet.kind === 'privy' ? 'Sign in with email' : 'Connect wallet'}
          </button>
          {wallet.unavailable && <p className="call-error">{wallet.unavailable}</p>}
        </div>
      </Shell>
    );
  }

  const total = payments?.reduce((s, p) => s + p.balance, 0n) ?? 0n;

  return (
    <Shell>
      <div className="dash-head">
        <div>
          <h2>Seller dashboard</h2>
          <p className="muted">
            Signed in · wallet <a href={`${explorer}/address/${wallet.address}`}>{short(wallet.address)}</a>
            {walletBalance !== null && <> · {usd(walletBalance, 4)}</>} · <span className="net">{info.networkName}</span>
          </p>
        </div>
        <button className="btn" onClick={wallet.logout}>
          Sign out
        </button>
      </div>

      {busy && <p className="busy">{busy}</p>}
      {error && <p className="call-error">{error}</p>}

      {!keys ? (
        <div className="panel dash-card">
          <h3>Unlock your private payments</h3>
          <p className="muted">
            Sign one message. It creates your stealth keys: a <b>viewing key</b> that finds your payments and a{' '}
            <b>spending key</b> that opens them. Same wallet, same keys, on any device.
          </p>
          <button className="btn primary" onClick={unlock} disabled={!!busy}>
            Sign to unlock
          </button>
        </div>
      ) : (
        <>
          {keyWarning && <p className="call-error">{keyWarning}</p>}

          <div className="dash-grid">
            <div className="panel dash-card">
              <h3>Your stealth ID</h3>
              <p className="muted">Share it to get paid privately. Every payment lands at a new address only you can open.</p>
              <Copy value={stealthId} />
              <p className="muted small">
                {registered
                  ? 'Registered on Arc: agents can find it from your wallet address.'
                  : 'Optional: register it on Arc so agents can find it from your wallet address.'}
              </p>
              {!registered && (
                <button className="btn" onClick={register} disabled={!!busy || !wallet.provider}>
                  {walletBalance === 0n ? 'Register free (we pay the fee)' : 'Register on Arc'}
                </button>
              )}
            </div>

            <div className="panel dash-card">
              <h3>Try it</h3>
              <p className="muted">
                Our demo agent pays your stealth ID {usd(info.testPaymentAmount, 3)}: it makes a fresh
                address from your ID, sends USDC there, and announces it on-chain. Then find it below.
              </p>
              <button className="btn primary" onClick={requestTestPayment} disabled={!!busy || !info.agent}>
                Send me a test payment
              </button>
              {testPayment && (
                <p className="muted small">
                  Sent to <a href={`${explorer}/address/${testPayment.stealthAddress}`}>{short(testPayment.stealthAddress)}</a> ·{' '}
                  <a href={`${explorer}/tx/${testPayment.transferTx}`}>tx</a>
                </p>
              )}
            </div>
          </div>

          <div className="panel dash-card">
            <div className="dash-head">
              <div>
                <h3>Payments to you</h3>
                <p className="muted">
                  {payments === null
                    ? 'Not scanned yet.'
                    : `${payments.length} payment${payments.length === 1 ? '' : 's'} · ${usd(total, 4)} available`}
                </p>
              </div>
              <button className="btn" onClick={() => refresh()} disabled={!!busy}>
                Scan again
              </button>
            </div>
            {payments?.length === 0 && <p className="muted">Nothing yet. Send yourself a test payment above.</p>}
            <ul className="calls">
              {payments?.map((p) => (
                <PaymentRow key={p.stealthAddress} payment={p} explorer={explorer} onSpend={async (to, amount) => {
                  const r = await run('Sending from the one-time address…', () =>
                    spendFromStealthAddress({ payment: p, to, amount, chain: chain!, client: client!, usdc: info.contracts.usdc }),
                  );
                  if (r) await refresh();
                  return r?.hash;
                }} />
              ))}
            </ul>
            <p className="note">
              Privacy tip: spend from each address on its own. Sending several of them to the same place links them
              together on-chain.
            </p>
          </div>

          <details className="panel dash-card">
            <summary>
              <b>Run your own paid API</b>
            </summary>
            <p className="muted">
              Give your server the viewing key and your stealth ID's public keys. It can recognise payments but can't
              spend them. Keep the spending key off servers.
            </p>
            <p className="label">Viewing key (lets the holder see your payments, not spend them)</p>
            <Copy value={keys.viewingKey} secret />
          </details>
        </>
      )}
    </Shell>
  );
}

function PaymentRow({
  payment,
  explorer,
  onSpend,
}: {
  payment: FoundPayment;
  explorer: string;
  onSpend: (to: Hex, amount?: bigint) => Promise<string | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [sentTx, setSentTx] = useState<string>();
  const valid = isAddress(to) && (amount === '' || Number(amount) > 0);

  return (
    <li className={payment.balance > 0n ? 'paid' : ''}>
      <div className="call-line">
        <code>
          <a href={`${explorer}/address/${payment.stealthAddress}`}>{short(payment.stealthAddress)}</a>
        </code>
        <span className="price">{usd(payment.balance, 4)}</span>
        <a className="status" href={`${explorer}/tx/${payment.transactionHash}`}>
          tx
        </a>
        <button className="btn small" onClick={() => setOpen(!open)} disabled={payment.balance === 0n}>
          Send
        </button>
      </div>
      {open && (
        <div className="spend">
          <input placeholder="To address 0x…" value={to} onChange={(e) => setTo(e.target.value.trim())} />
          <input placeholder="Amount (blank = all)" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.trim())} />
          <button
            className="btn primary small"
            disabled={!valid}
            onClick={async () => {
              const hash = await onSpend(to as Hex, amount ? parseUnits(amount, 6) : undefined);
              if (hash) setSentTx(hash);
            }}
          >
            Send
          </button>
          <p className="muted small">The network fee comes out of this address's own USDC. No top-up needed.</p>
        </div>
      )}
      {sentTx && (
        <div className="call-detail">
          sent · <a href={`${explorer}/tx/${sentTx}`}>tx</a>
        </div>
      )}
    </li>
  );
}

function Copy({ value, secret }: { value: string; secret?: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <code>{shown ? value : '•'.repeat(32)}</code>
      {secret && (
        <button className="btn small" onClick={() => setShown(!shown)}>
          {shown ? 'Hide' : 'Show'}
        </button>
      )}
      <button
        className="btn small"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="nav wrap">
        <a className="logo" href="/">
          PANSA
        </a>
        <nav>
          <a href="/">Home</a>
          <a href="/#demo">Live demo</a>
        </nav>
      </header>
      <main className="wrap dash">{children}</main>
    </>
  );
}

function friendly(err: unknown): string {
  const msg = (err as { shortMessage?: string; message?: string })?.shortMessage ?? (err as Error)?.message ?? String(err);
  if (/user rejected|denied|cancel/i.test(msg)) return 'Cancelled.';
  return msg;
}
