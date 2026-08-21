// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {RHBurnerPassMintTemplateV2} from "./RHBurnerPassMintTemplateV2.sol";

/// @title RHBurnerPassFactoryV2
/// @notice Permissionless factory for canonical RHBurnerPass v2 protected ERC-721 mints.
/// @dev No manual approval is required for Factory-created mints. Protocol bindings are one-time and permanent.
contract RHBurnerPassFactoryV2 {
    struct Integration {
        address owner;
        address payout;
        bool blocked;
    }

    address public owner;
    address public pendingOwner;
    address public immutable bootstrapper;
    address public registry;
    address public feeVault;
    bool public protocolBound;

    mapping(address mint => Integration integration) private _integrations;
    mapping(address mint => address pendingOwner_) public pendingIntegrationOwner;

    error OnlyOwner();
    error OnlyBootstrapperOrOwner();
    error OnlyIntegrationOwner();
    error ZeroAddress();
    error ProtocolAlreadyBound();
    error ProtocolNotBound();
    error IntegrationNotFound();
    error NotPendingOwner();
    error NotPendingIntegrationOwner();

    event ProtocolBound(address indexed registry, address indexed feeVault);
    event MintCreated(address indexed mint, address indexed integrationOwner, address indexed payout, address projectTreasury);
    event PayoutUpdated(address indexed mint, address indexed previousPayout, address indexed newPayout);
    event IntegrationBlocked(address indexed mint, bool blocked);
    event IntegrationOwnershipTransferStarted(address indexed mint, address indexed currentOwner, address indexed pendingOwner);
    event IntegrationOwnershipTransferred(address indexed mint, address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address owner_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        bootstrapper = msg.sender;
        emit OwnershipTransferred(address(0), owner_);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    function bindProtocol(address registry_, address feeVault_) external {
        if (msg.sender != owner && msg.sender != bootstrapper) revert OnlyBootstrapperOrOwner();
        if (protocolBound) revert ProtocolAlreadyBound();
        if (registry_ == address(0) || feeVault_ == address(0)) revert ZeroAddress();
        registry = registry_;
        feeVault = feeVault_;
        protocolBound = true;
        emit ProtocolBound(registry_, feeVault_);
    }

    /// @notice Deploys and automatically registers a canonical protected mint.
    /// @param payout Address credited with 10% of future delegated-mint protocol fees.
    function createMint(
        string calldata name_,
        string calldata symbol_,
        bytes32 merkleRoot_,
        uint256 mintPrice_,
        uint256 maxSupply_,
        address projectTreasury_,
        address payout,
        string calldata baseTokenURI_
    ) external returns (address mint) {
        if (!protocolBound) revert ProtocolNotBound();
        if (projectTreasury_ == address(0) || payout == address(0)) revert ZeroAddress();

        RHBurnerPassMintTemplateV2 deployed = new RHBurnerPassMintTemplateV2(
            address(this),
            registry,
            feeVault,
            name_,
            symbol_,
            merkleRoot_,
            mintPrice_,
            maxSupply_,
            projectTreasury_,
            baseTokenURI_
        );
        mint = address(deployed);

        _integrations[mint] = Integration({owner: msg.sender, payout: payout, blocked: false});
        emit MintCreated(mint, msg.sender, payout, projectTreasury_);
    }

    function isOfficialMint(address mint) public view returns (bool) {
        Integration memory integration = _integrations[mint];
        return integration.owner != address(0) && !integration.blocked;
    }

    function partnerOf(address mint) external view returns (address) {
        if (!isOfficialMint(mint)) return address(0);
        return _integrations[mint].payout;
    }

    function integrationInfo(address mint) external view returns (address integrationOwner, address payout, bool blocked, bool official) {
        Integration memory integration = _integrations[mint];
        return (integration.owner, integration.payout, integration.blocked, integration.owner != address(0) && !integration.blocked);
    }

    /// @notice Changes only future fee attribution. Already-accrued fees remain with the previous payout address.
    function updatePayout(address mint, address newPayout) external {
        Integration storage integration = _integrations[mint];
        if (integration.owner == address(0)) revert IntegrationNotFound();
        if (msg.sender != integration.owner) revert OnlyIntegrationOwner();
        if (newPayout == address(0)) revert ZeroAddress();
        address previousPayout = integration.payout;
        integration.payout = newPayout;
        emit PayoutUpdated(mint, previousPayout, newPayout);
    }

    /// @notice Emergency safety switch. It cannot redirect partner funds or seize integration ownership.
    function setIntegrationBlocked(address mint, bool blocked) external onlyOwner {
        if (_integrations[mint].owner == address(0)) revert IntegrationNotFound();
        _integrations[mint].blocked = blocked;
        emit IntegrationBlocked(mint, blocked);
    }

    function beginIntegrationOwnershipTransfer(address mint, address newOwner) external {
        Integration storage integration = _integrations[mint];
        if (integration.owner == address(0)) revert IntegrationNotFound();
        if (msg.sender != integration.owner) revert OnlyIntegrationOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        pendingIntegrationOwner[mint] = newOwner;
        emit IntegrationOwnershipTransferStarted(mint, integration.owner, newOwner);
    }

    function acceptIntegrationOwnership(address mint) external {
        Integration storage integration = _integrations[mint];
        if (integration.owner == address(0)) revert IntegrationNotFound();
        address pending = pendingIntegrationOwner[mint];
        if (msg.sender != pending) revert NotPendingIntegrationOwner();
        address previousOwner = integration.owner;
        integration.owner = pending;
        delete pendingIntegrationOwner[mint];
        emit IntegrationOwnershipTransferred(mint, previousOwner, pending);
    }

    function beginOwnershipTransfer(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address previousOwner = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(previousOwner, owner);
    }
}
