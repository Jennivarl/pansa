# PANSA contracts

- `ERC6538Registry` — maps an account to its stealth ID (spending + viewing public keys).
- `ERC5564Announcer` — emits the ephemeral key a receiver needs to find a stealth payment.

No owners, no admin, no upgrades, no funds held.

```sh
forge test
forge script script/Deploy.s.sol --rpc-url arc_testnet --account <keystore> --broadcast
```
