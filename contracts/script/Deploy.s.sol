// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ERC5564Announcer} from "../src/ERC5564Announcer.sol";
import {ERC6538Registry} from "../src/ERC6538Registry.sol";

/// Deploys through Arc's CREATE2 factory (0x4e59…956C), so testnet and mainnet get the same addresses.
/// forge script script/Deploy.s.sol --rpc-url arc_testnet --account <keystore> --broadcast
contract Deploy is Script {
    bytes32 constant SALT = keccak256("pansa.v1");

    function run() external returns (ERC5564Announcer announcer, ERC6538Registry registry) {
        vm.startBroadcast();
        announcer = new ERC5564Announcer{salt: SALT}();
        registry = new ERC6538Registry{salt: SALT}();
        vm.stopBroadcast();

        console.log("chainId          ", block.chainid);
        console.log("ERC5564Announcer ", address(announcer));
        console.log("ERC6538Registry  ", address(registry));
    }
}
