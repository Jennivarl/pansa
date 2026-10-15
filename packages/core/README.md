# @pansapay/core

ERC-5564 stealth addresses (scheme 1: secp256k1 with view tags) for [PANSA](https://pansapay.xyz), private payments for AI agents on Arc.

Compatible with ScopeLift's stealth-address SDK. No dependencies beyond `@noble/curves` and `@noble/hashes`.

```sh
npm install @pansapay/core
```

```ts
import {
  computeStealthPrivateKey,
  deriveStealthKeysFromSignature,
  generateStealthAddress,
  getStealthMetaAddress,
  scanAnnouncements,
  STEALTH_KEYS_MESSAGE,
} from '@pansapay/core';

// Receiver: keys from one wallet signature, then share the public stealth ID.
const keys = deriveStealthKeysFromSignature(await wallet.signMessage({ message: STEALTH_KEYS_MESSAGE }));
const stealthId = getStealthMetaAddress(keys);

// Payer: a fresh one-time address for every payment.
const { stealthAddress, ephemeralPublicKey, viewTag } = generateStealthAddress(stealthId);

// Receiver: find your payments among ERC-5564 announcements, and get each address's key.
const mine = scanAnnouncements(announcements, { ...keys, spendingPublicKey: stealthId.spendingPublicKey });
const key = computeStealthPrivateKey(ephemeralPublicKey, keys);
```

Also exports Arc constants (`ARC_MAINNET`, `ARC_TESTNET`, `ARC_USDC`, PANSA's registry and announcer addresses).

MIT licensed. Source: https://github.com/Jennivarl/pansa
