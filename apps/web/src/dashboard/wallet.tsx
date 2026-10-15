/**
 * One wallet interface for the dashboard: Privy (email login + embedded wallet) when an
 * app ID is configured, otherwise the browser's injected wallet (MetaMask etc.).
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { PrivyProvider, usePrivy, useSignMessage, useWallets } from '@privy-io/react-auth';
import type { Chain, EIP1193Provider, Hex } from 'viem';

export interface WalletApi {
  kind: 'privy' | 'injected';
  ready: boolean;
  address?: Hex;
  provider?: EIP1193Provider;
  login: () => void;
  logout: () => void;
  signMessage: (message: string) => Promise<Hex>;
  switchChain?: (chainId: number) => Promise<void>;
  unavailable?: string;
}

const WalletContext = createContext<WalletApi | null>(null);

export function useWallet(): WalletApi {
  const api = useContext(WalletContext);
  if (!api) throw new Error('useWallet outside WalletProvider');
  return api;
}

export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined;

export function WalletProvider({ chain, children }: { chain: Chain; children: ReactNode }) {
  if (!PRIVY_APP_ID) return <InjectedWallet>{children}</InjectedWallet>;
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email'],
        appearance: { theme: 'dark', accentColor: '#38bdf8', walletChainType: 'ethereum-only' },
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
        defaultChain: chain,
        supportedChains: [chain],
      }}
    >
      <PrivyWallet>{children}</PrivyWallet>
    </PrivyProvider>
  );
}

function PrivyWallet({ children }: { children: ReactNode }) {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { signMessage } = useSignMessage();
  const embedded = wallets.find((w) => w.walletClientType === 'privy');
  const [provider, setProvider] = useState<EIP1193Provider>();

  useEffect(() => {
    let live = true;
    setProvider(undefined);
    embedded?.getEthereumProvider().then((p) => live && setProvider(p as EIP1193Provider));
    return () => {
      live = false;
    };
  }, [embedded?.address]);

  const api = useMemo<WalletApi>(
    () => ({
      kind: 'privy',
      ready: ready && (!authenticated || walletsReady),
      address: authenticated ? (embedded?.address as Hex | undefined) : undefined,
      provider,
      login,
      logout: () => void logout(),
      signMessage: async (message) => {
        if (!embedded) throw new Error('Wallet not ready yet');
        const { signature } = await signMessage(
          { message },
          { address: embedded.address, uiOptions: { showWalletUIs: false } },
        );
        return signature as Hex;
      },
      switchChain: async (chainId) => {
        await embedded?.switchChain(chainId);
      },
    }),
    [ready, authenticated, walletsReady, embedded, provider, login, logout, signMessage],
  );
  return <WalletContext.Provider value={api}>{children}</WalletContext.Provider>;
}

function InjectedWallet({ children }: { children: ReactNode }) {
  const injected = (window as { ethereum?: EIP1193Provider }).ethereum;
  const [address, setAddress] = useState<Hex>();

  useEffect(() => {
    if (!injected) return;
    injected.request({ method: 'eth_accounts' }).then((a) => setAddress((a as Hex[])[0]));
    const onChange = (a: unknown) => setAddress((a as Hex[])[0]);
    injected.on?.('accountsChanged', onChange);
    return () => injected.removeListener?.('accountsChanged', onChange);
  }, [injected]);

  const api: WalletApi = {
    kind: 'injected',
    ready: true,
    address,
    provider: injected,
    unavailable: injected ? undefined : 'No browser wallet found. Install one, or set VITE_PRIVY_APP_ID for email login.',
    login: () => {
      injected?.request({ method: 'eth_requestAccounts' }).then((a) => setAddress((a as Hex[])[0]));
    },
    logout: () => setAddress(undefined),
    signMessage: async (message) => {
      if (!injected || !address) throw new Error('Connect a wallet first');
      return (await injected.request({ method: 'personal_sign', params: [message as Hex, address] })) as Hex;
    },
    switchChain: async (chainId) => {
      await injected?.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: `0x${chainId.toString(16)}` }] });
    },
  };
  return <WalletContext.Provider value={api}>{children}</WalletContext.Provider>;
}
