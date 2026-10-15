# PANSA

**Private payments for AI agents on Arc.**

**Live on Arc mainnet:** https://pansapay.xyz

AI agents pay for data, tools and other agents in USDC, and every payment is public. Anyone can read an agent's wallet and copy its suppliers, or add up a seller's income and list its customers.

PANSA sends each payment to a fresh **one-time stealth address** that only the seller can open. The explorer shows money leaving the agent, but not who received it.

- Works with **x402** and Circle's **x402 Facilitator** on Arc. Agents need no changes.
- Standard **ERC-5564** stealth addresses and **ERC-6538** registry. Compatible with ScopeLift's stealth-address SDK.
- **Non-custodial.** The contracts have no owner, no admin and hold no funds.

## Try it in 3 minutes

No wallet, no USDC and no setup needed. Everything below runs on **Arc mainnet** with real transactions.

**Part 1: watch an agent pay privately**

1. Open **https://pansapay.xyz**.
2. Scroll to **Live demo** and click **Run agent**. A real AI agent buys three API calls and pays for each one with x402.
3. Watch each call turn **paid ✓**. Under each one you'll see the **one-time address** it paid.
4. Compare the two boxes on the right. **Normal x402**: every payment goes to the same seller wallet. **With PANSA**: three unrelated addresses.
5. Click any one-time address. The Arc explorer shows a fresh address with no history and nothing pointing to the seller.

**Part 2: be the seller**

1. Click **Dashboard** (top right), then **Sign in with email**. Enter the code from your inbox. A wallet is created for you.
2. Click **Sign to unlock**. One signature creates your stealth keys in your browser. It costs nothing and the keys never reach our server.
3. Under **Your stealth ID** is the address you'd share to get paid privately. Optionally, click **Register free** to publish it on Arc. You sign and our demo agent pays the fee.
4. Click **Send me a test payment**. Our agent pays your stealth ID $0.005 on mainnet, to a brand-new address made from it.
5. After about 10 seconds the payment appears under **Payments to you**. Only your viewing key could find it.
6. Click **Send** on the payment, paste any address and leave the amount blank. The network fee comes out of the one-time address's own USDC: that's the Arc part. Click **tx** to see it on the explorer.

Limits keep the demo wallet safe: one agent run every 20 seconds and one test payment a minute per visitor.

## Why Arc

On most chains a stealth address can't move what it receives: it holds tokens but no ETH for gas, and topping it up from another wallet links it to its owner. Workarounds need relayers.

On Arc, **USDC is the gas token**, and its native and ERC-20 balances are the same balance. A stealth address pays its own fee out of the USDC it received. No relayer, no link.

[On-chain proof](https://explorer.arc.io/tx/0xc93e94cb3e7ebb859a37deb888061bb7cc731ef5146c339e0596e04483f71b35): a one-time address on Arc mainnet sending USDC and paying $0.0015 gas from its own balance.

Arc also has Circle's x402 Facilitator, instant finality, and a privacy layer on the roadmap that PANSA is built to plug into.

## Proven on Arc mainnet

- **x402, three paid calls, three unrelated addresses:** [weather](https://explorer.arc.io/tx/0x4219269f27cfb43ad57d23d5e598666b4635f29fc9acf684017f9382ae79e555) · [news](https://explorer.arc.io/tx/0x06a8e212ba85676e462c60164da61a0ef55601468457b6102c9510a75a65abfe) · [signals](https://explorer.arc.io/tx/0x2ab18677b901279a0844bcdfdaa8046e5d2e379af5efe97fdb110c69ea6708f2)
- **Free registry sign-up** (user signs, demo agent pays gas): [tx](https://explorer.arc.io/tx/0x3491113d5fd8dd52843b6edce2b1ab0bc6831c9808ebf31ae91cffcef6f560fb)
- **Pay a wallet address privately** (registry lookup, then a fresh stealth address): [transfer](https://explorer.arc.io/tx/0x70f4fef738e19be04b9c145573c1baad7498c4cd5447b295efbdef742bc6d055) · [announcement](https://explorer.arc.io/tx/0xc571864ba92201c844ce0926d8eb331cf9f0ef6d37a373c599883940fcca1f95)
- **A stealth address spending and paying its own gas ($0.0015) in USDC:** [tx](https://explorer.arc.io/tx/0xc93e94cb3e7ebb859a37deb888061bb7cc731ef5146c339e0596e04483f71b35)

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

| Contract | Address | Arc mainnet | Arc testnet |
|---|---|---|---|
| ERC5564Announcer | `0xb040Ee2a26cbBf36899aaB2aEdEBA7f7B1CC4D85` | [explorer](https://explorer.arc.io/address/0xb040Ee2a26cbBf36899aaB2aEdEBA7f7B1CC4D85) | [explorer](https://explorer.testnet.arc.io/address/0xb040Ee2a26cbBf36899aaB2aEdEBA7f7B1CC4D85) |
| ERC6538Registry | `0x974caaa9b4c3A0eff11E0a5b65aa36C41b8EaC1F` | [explorer](https://explorer.arc.io/address/0x974caaa9b4c3A0eff11E0a5b65aa36C41b8EaC1F) | [explorer](https://explorer.testnet.arc.io/address/0x974caaa9b4c3A0eff11E0a5b65aa36C41b8EaC1F) |

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
npm run setup -w @pansapay/demo      # writes throwaway testnet keys to apps/demo/.env
# fund the printed agent address at https://faucet.circle.com (Arc Testnet)
npm run build -w @pansapay/web
npm run api -w @pansapay/demo        # http://localhost:4021
npm run agent -w @pansapay/demo      # agent buys from the paid API
npm run seller -w @pansapay/demo     # seller's private view of its payments
npm run pay -w @pansapay/demo -- <0xaddress | st:arc:0x…> 0.01   # pay a registered address or stealth ID
```

For the dashboard's email login, set `VITE_PRIVY_APP_ID` in `apps/web/.env` before building. Without it, the dashboard falls back to a browser wallet.

Server settings: `ARC_NETWORK=mainnet`, `CIRCLE_API_KEY` (production auth; without it the Facilitator's keyless trial is used), `DATA_DIR`, `PORT`, `DEMO_DAILY_RUNS`.

## Use it

Seller, in front of any route:

```ts
import { CircleFacilitator, StealthSeller } from '@pansapay/x402';

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
import { createPayingFetch } from '@pansapay/x402';

const pay = createPayingFetch({ account, networks: ['eip155:5042'], maxAmount: 100_000n });
const res = await pay('https://api.example/signals');
```

## Privacy and security notes

- **Hidden today:** who received each payment. **Visible today:** amounts, timing, and the payer's own address. Hiding amounts is planned on Arc's privacy layer.
- With a Circle API key, the API server holds only the **viewing key** and can't spend. The keyless trial needs the spending key on the server to sign Circle's seller proof.
- Circle's Facilitator submits the payments, so it sees them. The public does not.
- The agent client only pays in allowed assets (USDC on Arc by default) and caps how long a signed authorization stays valid (5 minutes), whatever the 402 asks for.
- Spending several stealth addresses into one destination links them. The dashboard spends each one separately and warns about merging.
- Stealth keys derived from a wallet signature need a deterministic signer. The dashboard checks this and warns if the wallet isn't.

## Roadmap

- **Now:** hidden receivers for x402 on Arc, seller add-on, paying fetch with verified payee, pay-by-address via the registry, on-chain announcements for x402 payments, seller dashboard.
- **Next:** SDK on npm.
- **With Arc Privacy:** hidden amounts and selective disclosure with view keys, on the same stealth addresses.
