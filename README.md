# PANSA

**Private payments for AI agents on Arc.**

AI agents pay for data, tools and other agents in USDC, and every payment is public. Anyone can read an agent's wallet and copy its suppliers, or add up a seller's income and list its customers.

PANSA sends each payment to a fresh **one-time stealth address** that only the seller can open. The explorer shows money leaving the agent, but not who received it.

- Works with **x402** and Circle's **x402 Facilitator** on Arc. Agents need no changes.
- Standard **ERC-5564** stealth addresses and **ERC-6538** registry. Compatible with ScopeLift's stealth-address SDK.
- **Non-custodial.** The contracts have no owner, no admin and hold no funds.

## Why Arc

On most chains a stealth address can't move what it receives: it holds tokens but no ETH for gas, and topping it up from another wallet links it to its owner. Workarounds need relayers.

On Arc, **USDC is the gas token**, and its native and ERC-20 balances are the same balance. A stealth address pays its own fee out of the USDC it received. No relayer, no link.

[On-chain proof](https://explorer.testnet.arc.io/tx/0x50791d14ae7f85451adf061d41e72e4be1046dd6971aab559c667c1f8209b13b): a one-time address sending USDC and paying $0.0018 gas from its own balance.

Arc also has Circle's x402 Facilitator, instant finality, and a privacy layer on the roadmap that PANSA is built to plug into.

## How it works

**Mode A: x402 (paid APIs)**

1. An agent calls a paid API.
2. The API answers `402 Payment Required` with a one-time `payTo` derived from the seller's stealth ID. The ephemeral key rides along in `extra.pansa`.
3. The agent signs a normal EIP-3009 USDC authorization. Any x402 client works.
4. The seller checks that `payTo` is really its own (viewing key, no database), and Circle's Facilitator settles it on Arc.
5. Later, the seller derives the key for that address and spends from it.

**Mode B: pay a stealth ID directly**

The payer derives the one-time address from the receiver's public stealth ID (shared directly or looked up in the registry), sends USDC, and publishes an ERC-5564 announcement. The receiver finds it by scanning announcements with their viewing key, in their own browser.

## What's in the repo

| Path | What it is |
|---|---|
| `packages/core` | ERC-5564 scheme 1 (secp256k1 + view tags): generate, scan, derive spend keys. Keys from a wallet signature. |
| `packages/x402` | x402 v2 seller add-on (`StealthSeller`), Circle Facilitator client with seller proofs, paying `fetch` for agents, Mode B `sendStealthPayment`. |
| `contracts` | `ERC6538Registry` and `ERC5564Announcer` (Foundry). |
| `apps/demo` | Server: paid API, live demo, announcement index, serves the site. CLI scripts for agent, seller and spending. |
| `apps/web` | Website with live demo, and a seller dashboard (Privy email login) that scans and spends in the browser. |

## Contracts

Deployed through Arc's CREATE2 factory with salt `keccak256("pansa.v1")`, so the addresses match on every network.

| Contract | Address |
|---|---|
| ERC5564Announcer | `0xb040Ee2a26cbBf36899aaB2aEdEBA7f7B1CC4D85` |
| ERC6538Registry | `0x974caaa9b4c3A0eff11E0a5b65aa36C41b8EaC1F` |

## Run it

Requires Node 22+ and [Foundry](https://getfoundry.sh).

```sh
git clone --recursive https://github.com/Jennivarl/pansa && cd pansa
npm install
npm run build
npm test                          # core + x402
(cd contracts && forge test)      # contracts
```

Demo on Arc testnet:

```sh
npm run setup -w @pansa/demo      # writes throwaway testnet keys to apps/demo/.env
# fund the printed agent address at https://faucet.circle.com (Arc Testnet)
npm run build -w @pansa/web
npm run api -w @pansa/demo        # http://localhost:4021
npm run agent -w @pansa/demo      # agent buys from the paid API
npm run seller -w @pansa/demo     # seller's private view of its payments
```

For the dashboard's email login, set `VITE_PRIVY_APP_ID` in `apps/web/.env` before building. Without it, the dashboard falls back to a browser wallet.

Server settings: `ARC_NETWORK=mainnet`, `CIRCLE_API_KEY` (production auth; without it the Facilitator's keyless trial is used), `DATA_DIR`, `PORT`, `DEMO_DAILY_RUNS`.

## Use it

Seller, in front of any route:

```ts
import { CircleFacilitator, StealthSeller } from '@pansa/x402';

const seller = new StealthSeller({
  meta,                   // your stealth ID (public keys)
  viewingKey,             // recognises payments, can't spend
  network: 'eip155:5042',
  facilitator: new CircleFacilitator({ apiKey }),
});

const result = await seller.handle(req.headers['payment-signature'], {
  amount: 10_000n,        // $0.01
  resource: { url: req.url },
});
if (!result.paid) return reply(402, result.reply);
```

Agent:

```ts
import { createPayingFetch } from '@pansa/x402';

const pay = createPayingFetch({ account, networks: ['eip155:5042'], maxAmount: 100_000n });
const res = await pay('https://api.example/signals');
```

## Privacy and security notes

- **Hidden today:** who received each payment. **Visible today:** amounts, timing, and the payer's own address. Hiding amounts is planned on Arc's privacy layer.
- With a Circle API key, the API server holds only the **viewing key** and can't spend. The keyless trial needs the spending key on the server to sign Circle's seller proof.
- Circle's Facilitator submits the payments, so it sees them. The public does not.
- Spending several stealth addresses into one destination links them. The dashboard spends each one separately and warns about merging.
- Stealth keys derived from a wallet signature need a deterministic signer. The dashboard checks this and warns if the wallet isn't.

## Roadmap

- **Now:** hidden receivers for x402 on Arc, seller add-on, paying fetch, Mode B, seller dashboard.
- **Next:** announcements for x402 payments, registry lookup in the agent client, SDK on npm.
- **With Arc Privacy:** hidden amounts and selective disclosure with view keys, on the same stealth addresses.
