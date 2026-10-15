// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ERC5564Announcer} from "../src/ERC5564Announcer.sol";

contract ERC5564AnnouncerTest is Test {
    event Announcement(
        uint256 indexed schemeId,
        address indexed stealthAddress,
        address indexed caller,
        bytes ephemeralPubKey,
        bytes metadata
    );

    ERC5564Announcer announcer = new ERC5564Announcer();

    function testFuzz_EmitsAnnouncement(
        uint256 schemeId,
        address stealthAddress,
        address caller,
        bytes memory ephemeralPubKey,
        bytes memory metadata
    ) public {
        vm.expectEmit(address(announcer));
        emit Announcement(schemeId, stealthAddress, caller, ephemeralPubKey, metadata);
        vm.prank(caller);
        announcer.announce(schemeId, stealthAddress, ephemeralPubKey, metadata);
    }
}
