// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ERC-5564 stealth address announcer
/// @notice Lets a payer publish the ephemeral public key a receiver needs to find a stealth payment.
/// No owner, no state, no admin: it only emits events.
contract ERC5564Announcer {
    /// @param schemeId 1 = secp256k1 with view tags
    /// @param stealthAddress the one-time address that received the funds
    /// @param caller who announced (the payer, or a relayer)
    /// @param ephemeralPubKey the payer's ephemeral public key (33 bytes, compressed)
    /// @param metadata view tag (1 byte), selector (4), token (20), amount (32)
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    function announce(uint256 schemeId, address stealthAddress, bytes memory ephemeralPubKey, bytes memory metadata)
        external
    {
        emit Announcement(schemeId, stealthAddress, msg.sender, ephemeralPubKey, metadata);
    }
}
