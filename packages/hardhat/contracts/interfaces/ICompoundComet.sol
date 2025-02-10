// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

interface ICompoundComet {
        // The AssetInfo struct as defined in the protocol.
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
    
    // Returns the number of supported collateral assets.
    function numAssets() external view returns (uint8);
    
    // Returns the AssetInfo struct for the asset at index i.
    function getAssetInfo(uint8 i) external view returns (AssetInfo memory);
    function getAssetInfoByAddress(address asset) external view returns (AssetInfo memory);
    function getPrice(address priceFeed) external view returns (uint128);

    // Returns the collateral balance of a given account for a given asset.
    function collateralBalanceOf(address account, address asset) external view returns (uint128);


    function balanceOf(address owner) external view returns (uint256);
    function borrowBalanceOf(address account) external view returns (uint256);
    function getSupplyRate(uint utilization) external view returns (uint64);
    function getBorrowRate(uint utilization) external view returns (uint64);
    function getUtilization() external view returns (uint);
    function baseToken() external view returns (address);
    function baseTokenPriceFeed() external view returns (address);
    function priceScale() external pure returns (uint64);
}
