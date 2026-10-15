// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC6538Registry, IERC1271} from "../src/ERC6538Registry.sol";

contract MockSmartWallet is IERC1271 {
    bytes32 public approved;

    function approve(bytes32 digest) external {
        approved = digest;
    }

    function isValidSignature(bytes32 digest, bytes memory) external view returns (bytes4) {
        return digest == approved ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

contract RevertingWallet {
    fallback() external {
        revert("nope");
    }
}

contract ERC6538RegistryTest is Test {
    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    uint256 constant SCHEME_ID = 1;
    uint256 constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    uint256 constant N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141;

    ERC6538Registry registry = new ERC6538Registry();
    bytes metaAddress = abi.encodePacked(bytes32(uint256(1)), bytes32(uint256(2)), bytes2(0x0304));

    function _digest(bytes memory meta, uint256 nonce) internal view returns (bytes32) {
        bytes32 structHash =
            keccak256(abi.encode(registry.ERC6538REGISTRY_ENTRY_TYPE_HASH(), SCHEME_ID, keccak256(meta), nonce));
        return keccak256(abi.encodePacked("\x19\x01", registry.DOMAIN_SEPARATOR(), structHash));
    }

    function _sign(uint256 pk, bytes32 digest) internal pure returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function test_RegisterKeys() public {
        vm.expectEmit(address(registry));
        emit StealthMetaAddressSet(address(this), SCHEME_ID, metaAddress);
        registry.registerKeys(SCHEME_ID, metaAddress);
        assertEq(registry.stealthMetaAddressOf(address(this), SCHEME_ID), metaAddress);
    }

    function test_RegisterKeysOverwrites() public {
        registry.registerKeys(SCHEME_ID, metaAddress);
        registry.registerKeys(SCHEME_ID, hex"aa");
        assertEq(registry.stealthMetaAddressOf(address(this), SCHEME_ID), hex"aa");
    }

    function test_RegisterOnBehalf_EOA() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        bytes memory sig = _sign(pk, _digest(metaAddress, 0));

        vm.expectEmit(address(registry));
        emit StealthMetaAddressSet(alice, SCHEME_ID, metaAddress);
        vm.prank(makeAddr("relayer"));
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, metaAddress);

        assertEq(registry.stealthMetaAddressOf(alice, SCHEME_ID), metaAddress);
        assertEq(registry.nonceOf(alice), 1);
    }

    function test_RevertWhen_Replayed() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        bytes memory sig = _sign(pk, _digest(metaAddress, 0));
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, metaAddress);

        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, metaAddress);
    }

    function test_RevertWhen_WrongSigner() public {
        address alice = makeAddr("alice");
        (, uint256 mallory) = makeAddrAndKey("mallory");
        bytes memory sig = _sign(mallory, _digest(metaAddress, 0));

        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, metaAddress);
    }

    function test_RevertWhen_DifferentMetaAddress() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        bytes memory sig = _sign(pk, _digest(metaAddress, 0));

        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, hex"bad0");
    }

    function test_RevertWhen_MalleableSignature() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, _digest(metaAddress, 0));
        // Flip to the high-s twin: same signer recovers, but it must be rejected.
        bytes memory flipped = abi.encodePacked(r, bytes32(N - uint256(s)), v == 27 ? uint8(28) : uint8(27));
        assertGt(N - uint256(s), HALF_N);

        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, flipped, metaAddress);
    }

    function test_RevertWhen_BadLength() public {
        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(makeAddr("alice"), SCHEME_ID, hex"1234", metaAddress);
    }

    function test_IncrementNonceInvalidatesSignature() public {
        (address alice, uint256 pk) = makeAddrAndKey("alice");
        bytes memory sig = _sign(pk, _digest(metaAddress, 0));

        vm.expectEmit(address(registry));
        emit NonceIncremented(alice, 1);
        vm.prank(alice);
        registry.incrementNonce();

        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(alice, SCHEME_ID, sig, metaAddress);
    }

    function test_RegisterOnBehalf_SmartWallet() public {
        MockSmartWallet wallet = new MockSmartWallet();
        wallet.approve(_digest(metaAddress, 0));

        registry.registerKeysOnBehalf(address(wallet), SCHEME_ID, "", metaAddress);
        assertEq(registry.stealthMetaAddressOf(address(wallet), SCHEME_ID), metaAddress);
    }

    function test_RevertWhen_SmartWalletRejects() public {
        MockSmartWallet wallet = new MockSmartWallet();
        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(address(wallet), SCHEME_ID, "", metaAddress);
    }

    function test_RevertWhen_SmartWalletReverts() public {
        address wallet = address(new RevertingWallet());
        vm.expectRevert(ERC6538Registry.ERC6538Registry__InvalidSignature.selector);
        registry.registerKeysOnBehalf(wallet, SCHEME_ID, "", metaAddress);
    }

    function test_DomainSeparatorFollowsChainId() public {
        bytes32 before = registry.DOMAIN_SEPARATOR();
        vm.chainId(5042002);
        assertTrue(registry.DOMAIN_SEPARATOR() != before);
    }
}
