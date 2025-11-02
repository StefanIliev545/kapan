// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ICompoundComet {
    struct AssetInfo {
        uint8 offset;
        address asset;
        address priceFeed;
        uint64 scale;
        uint64 borrowCollateralFactor;
        uint64 liquidateCollateralFactor;
        uint64 liquidationFactor;
        uint128 supplyCap;
    }
    
    function baseToken() external view returns (address);
    function allow(address manager, bool isAllowed) external;

    // Supply/withdraw APIs
    function supplyTo(address dst, address asset, uint amount) external;
    function withdrawFrom(address src, address to, address asset, uint amount) external;

    // Views
    function balanceOf(address owner) external view returns (uint256); // base position
    function borrowBalanceOf(address account) external view returns (uint256);
    function collateralBalanceOf(address account, address asset) external view returns (uint128);
    
    // View methods for view gateway
    function numAssets() external view returns (uint8);
    function getAssetInfo(uint8 i) external view returns (AssetInfo memory);
    function getAssetInfoByAddress(address asset) external view returns (AssetInfo memory);
    function getPrice(address priceFeed) external view returns (uint128);
    function userCollateral(address account, address asset) external view returns (uint128, uint128);
    function getSupplyRate(uint utilization) external view returns (uint64);
    function getBorrowRate(uint utilization) external view returns (uint64);
    function getUtilization() external view returns (uint);
    function baseTokenPriceFeed() external view returns (address);
    function priceScale() external pure returns (uint64);
}


