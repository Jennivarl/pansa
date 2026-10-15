# @pansapay/x402

Private x402 payments on Arc for [PANSA](https://pansapay.xyz): every payment lands at a fresh one-time stealth address that only the seller can open.

```sh
npm install @pansapay/x402 viem
```

**Seller**: put it in front of any paid route.

```ts
import { CircleFacilitator, StealthSeller } from '@pansapay/x402';

const seller = new StealthSeller({
  meta,                   // your stealth ID (public keys)
  viewingKey,             // recognises payments, can't spend
  network: 'eip155:5042', // Arc mainnet
  facilitator: new CircleFacilitator({ apiKey }),
});

const result = await seller.handle(req.headers['payment-signature'], {
  amount: 10_000n,        // $0.01 in USDC atomic units
  resource: { url: req.url },
});
if (!result.paid) return reply(402, result.reply);
```

**Agent**: a `fetch` that pays automatically, within a budget.

```ts
import { createPayingFetch } from '@pansapay/x402';

const pay = createPayingFetch({ account, networks: ['eip155:5042'], maxAmount: 100_000n });
const res = await pay('https://api.example/signals');
```

It only pays in allowed assets (USDC on Arc by default) and caps signed authorizations at 5 minutes. Pass `payee` (the seller's stealth ID) to derive the one-time address yourself, so a compromised server can't redirect funds.

**Direct payments**: `sendStealthPayment`, `payRegisteredAccount` (ERC-6538 registry lookup) and `registerOnBehalf`.

Node-only helpers (a JSON file payment store) are in `@pansapay/x402/node`.

MIT licensed. Source: https://github.com/Jennivarl/pansa
