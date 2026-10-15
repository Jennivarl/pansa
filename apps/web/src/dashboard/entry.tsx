import { useEffect, useMemo, useState } from 'react';
import { getInfo, type Info } from '../api';
import { arcChainFrom } from './chain';
import { Dashboard } from './Dashboard';
import { WalletProvider } from './wallet';

/** Privy needs the chain up front, so load server info before mounting the provider. */
export default function DashboardApp() {
  const [info, setInfo] = useState<Info | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    getInfo().then(setInfo).catch(() => setFailed(true));
  }, []);
  const chain = useMemo(() => (info ? arcChainFrom(info) : null), [info]);

  if (failed) return <p className="wrap muted">Can't reach the PANSA server.</p>;
  if (!chain) return null;
  return (
    <WalletProvider chain={chain}>
      <Dashboard />
    </WalletProvider>
  );
}
