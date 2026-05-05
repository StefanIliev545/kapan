// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @notice Slim interface for the AlchemistV3 ERC721 position token.
///         The on-chain contract is `ERC721Enumerable`, so `tokenOfOwnerByIndex` is callable
///         for off-chain enumeration; we only need the standard transfer/approval surface here.
interface IAlchemistV3Position is IERC721 {
    function balanceOf(address owner) external view override returns (uint256);

    function ownerOf(uint256 tokenId) external view override returns (address);

    function tokenOfOwnerByIndex(address owner, uint256 index) external view returns (uint256);
}
