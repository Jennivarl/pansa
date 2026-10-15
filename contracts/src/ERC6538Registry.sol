// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4);
}

/// @title ERC-6538 stealth meta-address registry
/// @notice Maps an account to its public "stealth ID" (spending + viewing public keys) so anyone
/// can pay it privately. No owner, no admin, no upgrades: each account controls only its own entry.
contract ERC6538Registry {
    error ERC6538Registry__InvalidSignature();

    /// @dev secp256k1 n / 2, for rejecting malleable signatures.
    uint256 private constant HALF_N = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    bytes32 public constant ERC6538REGISTRY_ENTRY_TYPE_HASH =
        keccak256("Erc6538RegistryEntry(uint256 schemeId,bytes stealthMetaAddress,uint256 nonce)");

    mapping(address registrant => mapping(uint256 schemeId => bytes)) public stealthMetaAddressOf;
    mapping(address registrant => uint256) public nonceOf;

    uint256 internal immutable INITIAL_CHAIN_ID;
    bytes32 internal immutable INITIAL_DOMAIN_SEPARATOR;

    event StealthMetaAddressSet(address indexed registrant, uint256 indexed schemeId, bytes stealthMetaAddress);
    event NonceIncremented(address indexed registrant, uint256 newNonce);

    constructor() {
        INITIAL_CHAIN_ID = block.chainid;
        INITIAL_DOMAIN_SEPARATOR = _computeDomainSeparator();
    }

    function registerKeys(uint256 schemeId, bytes calldata stealthMetaAddress) external {
        stealthMetaAddressOf[msg.sender][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(msg.sender, schemeId, stealthMetaAddress);
    }

    /// @notice Register for someone who signed an EIP-712 entry (EOA) or approves via ERC-1271 (smart wallet).
    /// Lets a gas-less account get registered by anyone without revealing a funding link.
    function registerKeysOnBehalf(
        address registrant,
        uint256 schemeId,
        bytes memory signature,
        bytes calldata stealthMetaAddress
    ) external {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(
                        ERC6538REGISTRY_ENTRY_TYPE_HASH, schemeId, keccak256(stealthMetaAddress), nonceOf[registrant]++
                    )
                )
            )
        );
        if (!_isValidSignature(registrant, digest, signature)) revert ERC6538Registry__InvalidSignature();

        stealthMetaAddressOf[registrant][schemeId] = stealthMetaAddress;
        emit StealthMetaAddressSet(registrant, schemeId, stealthMetaAddress);
    }

    /// @notice Invalidates any signed-but-unused registration.
    function incrementNonce() external {
        emit NonceIncremented(msg.sender, ++nonceOf[msg.sender]);
    }

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return block.chainid == INITIAL_CHAIN_ID ? INITIAL_DOMAIN_SEPARATOR : _computeDomainSeparator();
    }

    function _isValidSignature(address signer, bytes32 digest, bytes memory signature) internal view returns (bool) {
        if (signer.code.length > 0) {
            try IERC1271(signer).isValidSignature(digest, signature) returns (bytes4 magic) {
                return magic == IERC1271.isValidSignature.selector;
            } catch {
                return false;
            }
        }
        if (signature.length != 65) return false;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 0x20))
            s := mload(add(signature, 0x40))
            v := byte(0, mload(add(signature, 0x60)))
        }
        if (uint256(s) > HALF_N) return false;
        address recovered = ecrecover(digest, v, r, s);
        return recovered != address(0) && recovered == signer;
    }

    function _computeDomainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("ERC6538Registry"),
                keccak256("1.0"),
                block.chainid,
                address(this)
            )
        );
    }
}
