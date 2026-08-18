// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {RHBurnerPassMintGate} from "./RHBurnerPassMintGate.sol";

/// @title RHBurnerPassDemoMint
/// @notice Testnet ERC-721 showing delegated Merkle allowlist minting + per-NFT RHBurnerPass fee.
/// @dev Demo code. Do not treat as an audited production drop contract.
contract RHBurnerPassDemoMint is ERC721, RHBurnerPassMintGate {
    bytes32 public immutable merkleRoot;
    uint256 public immutable mintPrice;
    address public immutable projectTreasury;
    uint256 public nextTokenId = 1;

    error BadProof();
    error WrongPayment();
    error OnlyProjectTreasury();
    error WithdrawFailed();

    event ProtectedMint(
        address indexed vault,
        address indexed burner,
        uint256 quantity,
        uint256 projectPayment,
        uint256 protocolFee
    );

    constructor(
        address registry_,
        address feeVault_,
        bytes32 root_,
        uint256 mintPrice_,
        address projectTreasury_
    ) ERC721("RHBurnerPass Test NFT", "RHBPTEST") RHBurnerPassMintGate(registry_, feeVault_) {
        merkleRoot = root_;
        mintPrice = mintPrice_;
        if (projectTreasury_ == address(0)) revert OnlyProjectTreasury();
        projectTreasury = projectTreasury_;
    }

    /// @param vault Wallet that earned the allowlist allocation.
    /// @param maxAllocation Allocation encoded in that vault's Merkle leaf.
    /// @param quantity Number of NFTs to mint to msg.sender (the burner or vault).
    /// @param proof Merkle proof generated for [vault, maxAllocation].
    function mint(
        address vault,
        uint256 maxAllocation,
        uint256 quantity,
        bytes32[] calldata proof
    ) external payable {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(vault, maxAllocation))));
        if (!MerkleProof.verifyCalldata(proof, merkleRoot, leaf)) revert BadProof();

        uint256 projectPayment = mintPrice * quantity;
        uint256 protocolFee = rhBurnerPassFee(msg.sender, vault, quantity);
        if (msg.value != projectPayment + protocolFee) revert WrongPayment();

        _consumeVaultAllocation(vault, quantity, maxAllocation);
        _collectRHBurnerPassFee(vault, quantity);

        for (uint256 i = 0; i < quantity; ++i) {
            _safeMint(msg.sender, nextTokenId++);
        }

        emit ProtectedMint(vault, msg.sender, quantity, projectPayment, protocolFee);
    }

    function withdrawProjectProceeds() external {
        if (msg.sender != projectTreasury) revert OnlyProjectTreasury();
        uint256 amount = address(this).balance;
        (bool ok,) = payable(projectTreasury).call{value: amount}("");
        if (!ok) revert WithdrawFailed();
    }
}
