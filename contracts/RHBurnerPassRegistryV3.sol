// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRHBurnerPassFactoryOfficialView {
    function isOfficialMint(address mint) external view returns (bool);
}

/// @title RHBurnerPassRegistryV3
/// @notice Vault-to-burner registry for permissionless Factory-created RHBurnerPass v2 mints.
/// @dev Revocation is always allowed, including after an integration is emergency-blocked.
contract RHBurnerPassRegistryV3 {
    mapping(bytes32 delegationKey => bool enabled) private _delegations;
    IRHBurnerPassFactoryOfficialView public immutable factory;

    error ZeroAddress();
    error VaultCannotBeBurner();
    error UnofficialTarget();

    event BurnerAuthorizationSet(address indexed vault, address indexed burner, address indexed target, bool enabled);

    constructor(address factory_) {
        if (factory_ == address(0)) revert ZeroAddress();
        factory = IRHBurnerPassFactoryOfficialView(factory_);
    }

    function setBurner(address burner, address target, bool enabled) external {
        if (burner == address(0) || target == address(0)) revert ZeroAddress();
        if (burner == msg.sender) revert VaultCannotBeBurner();
        if (enabled && !factory.isOfficialMint(target)) revert UnofficialTarget();
        _delegations[_key(msg.sender, burner, target)] = enabled;
        emit BurnerAuthorizationSet(msg.sender, burner, target, enabled);
    }

    function isAuthorized(address vault, address burner, address target) external view returns (bool) {
        if (vault == burner) return true;
        return _delegations[_key(vault, burner, target)];
    }

    function delegationKey(address vault, address burner, address target) external pure returns (bytes32) {
        return _key(vault, burner, target);
    }

    function _key(address vault, address burner, address target) private pure returns (bytes32) {
        return keccak256(abi.encode(vault, burner, target));
    }
}
