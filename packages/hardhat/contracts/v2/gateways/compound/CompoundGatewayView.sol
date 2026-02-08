// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ICompoundComet} from "../../interfaces/compound/ICompoundComet.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Interface for reading from write gateway
interface IWriteGateway {
    function tokenToComet(address) external view returns (ICompoundComet);
    function allComets() external view returns (address[] memory);
}

/**
 * @title CompoundGatewayView
 * @notice View-only gateway for Compound Comet protocol
 * @dev Contains all read/view functions from v1, separate from write operations
 */
contract CompoundGatewayView is Ownable {
    // base token => Comet
    mapping(address => ICompoundComet) public tokenToComet;
    mapping(address => AggregatorV3Interface) public overrideFeeds;

    // registry for view
    address[] private _comets;
    mapping(address => bool) private _isRegistered;

    // Optional reference to write gateway for syncing Comet registry
    address public writeGateway;

    event CometRegistered(address indexed baseToken, address indexed comet);
    event CometReplaced(address indexed baseToken, address indexed oldComet, address indexed newComet);
    event WriteGatewayUpdated(address indexed oldGateway, address indexed newGateway);

    constructor(address owner_) Ownable(owner_) {}

    modifier whenCometExists(address token) {
        if (address(tokenToComet[token]) != address(0)) {
            _;
        }
    }

    modifier cometMustExist(address token) {
        require(address(tokenToComet[token]) != address(0), "Comet is not set");
        _;
    }

    function addComet(ICompoundComet comet) external onlyOwner {
        address base = comet.baseToken();
        require(base != address(0), "Compound: base=0");
        address prev = address(tokenToComet[base]);

        tokenToComet[base] = comet;
        if (!_isRegistered[address(comet)]) { _isRegistered[address(comet)] = true; _comets.push(address(comet)); }
        emit CometRegistered(base, address(comet));
        if (prev != address(0) && prev != address(comet)) emit CometReplaced(base, prev, address(comet));
    }

    function setCometForBase(address baseToken, address comet_) external onlyOwner {
        require(baseToken != address(0) && comet_ != address(0), "Compound: zero");
        address prev = address(tokenToComet[baseToken]);
        tokenToComet[baseToken] = ICompoundComet(comet_);
        if (!_isRegistered[comet_]) { _isRegistered[comet_] = true; _comets.push(comet_); }
        emit CometRegistered(baseToken, comet_);
        if (prev != address(0) && prev != comet_) emit CometReplaced(baseToken, prev, comet_);
    }

    function allComets() external view returns (address[] memory) { return _comets; }

    /// @notice Get all base tokens for registered Comets
    function allBaseTokens() external view returns (address[] memory) {
        address[] memory baseTokens = new address[](_comets.length);
        for (uint256 i = 0; i < _comets.length; i++) {
            baseTokens[i] = ICompoundComet(_comets[i]).baseToken();
        }
        return baseTokens;
    }

    /// @notice Get all active Comets (union of local + write gateway registries)
    function allActiveComets() public view returns (address[] memory comets) {
        address[] memory local = _comets;
        address[] memory remote = writeGateway == address(0)
            ? new address[](0)
            : IWriteGateway(writeGateway).allComets();

        // Upper bound, then de-dupe
        comets = new address[](local.length + remote.length);
        uint256 k = 0;

        for (uint256 i = 0; i < local.length; i++) comets[k++] = local[i];

        for (uint256 j = 0; j < remote.length; j++) {
            address c = remote[j];
            bool seen = false;
            for (uint256 i = 0; i < k; i++) {
                if (comets[i] == c) { seen = true; break; }
            }
            if (!seen) comets[k++] = c;
        }
        assembly { mstore(comets, k) } // shrink
    }

    /// @notice Get all active base tokens (from allActiveComets)
    function allActiveBaseTokens() external view returns (address[] memory bases) {
        address[] memory comets = allActiveComets();
        bases = new address[](comets.length);
        for (uint256 i = 0; i < comets.length; i++) {
            bases[i] = ICompoundComet(comets[i]).baseToken();
        }
    }

    function overrideFeed(address token, AggregatorV3Interface feed) external onlyOwner {
        overrideFeeds[token] = feed;
    }

    /// @notice Set the write gateway address for syncing Comet registry
    function setWriteGateway(address writeGateway_) external onlyOwner {
        address oldGateway = writeGateway;
        writeGateway = writeGateway_;
        emit WriteGatewayUpdated(oldGateway, writeGateway_);
    }

    /// @notice Sync a Comet from the write gateway to this view gateway
    function syncCometFromWriteGateway(address baseToken) external onlyOwner {
        require(writeGateway != address(0), "Compound: write gateway not set");
        ICompoundComet cometFromWrite = IWriteGateway(writeGateway).tokenToComet(baseToken);
        require(address(cometFromWrite) != address(0), "Compound: comet not in write gateway");
        
        // Register in this view gateway - inline the logic to avoid ordering issues
        address prev = address(tokenToComet[baseToken]);
        tokenToComet[baseToken] = cometFromWrite;
        if (!_isRegistered[address(cometFromWrite)]) {
            _isRegistered[address(cometFromWrite)] = true;
            _comets.push(address(cometFromWrite));
        }
        emit CometRegistered(baseToken, address(cometFromWrite));
        if (prev != address(0) && prev != address(cometFromWrite)) {
            emit CometReplaced(baseToken, prev, address(cometFromWrite));
        }
    }

    /// @notice Sync all Comets from write gateway
    function syncAllCometsFromWriteGateway() external onlyOwner {
        require(writeGateway != address(0), "Compound: write gateway not set");
        address[] memory writeComets = IWriteGateway(writeGateway).allComets();
        
        // For each comet, sync it
        for (uint256 i = 0; i < writeComets.length; i++) {
            ICompoundComet comet = ICompoundComet(writeComets[i]);
            address baseToken = comet.baseToken();
            if (address(tokenToComet[baseToken]) != address(comet)) {
                // Inline the logic to avoid ordering issues
                address prev = address(tokenToComet[baseToken]);
                tokenToComet[baseToken] = comet;
                if (!_isRegistered[address(comet)]) {
                    _isRegistered[address(comet)] = true;
                    _comets.push(address(comet));
                }
                emit CometRegistered(baseToken, address(comet));
                if (prev != address(0) && prev != address(comet)) {
                    emit CometReplaced(baseToken, prev, address(comet));
                }
            }
        }
    }

    /// @notice Get Comet for base token, falling back to write gateway if not found locally
    function getComet(address baseToken) public view returns (ICompoundComet) {
        ICompoundComet local = tokenToComet[baseToken];
        if (address(local) != address(0)) {
            return local;
        }
        // Fallback to write gateway if set
        if (writeGateway != address(0)) {
            try IWriteGateway(writeGateway).tokenToComet(baseToken) returns (ICompoundComet comet) {
                if (address(comet) != address(0)) {
                    return comet;
                }
            } catch {
                // Fall through to revert
            }
        }
        revert("Compound: comet not found");
    }

    function getSupplyRate(address token) external view whenCometExists(token) returns (uint256 supplyRate, bool success) {
        ICompoundComet comet = getComet(token);
        supplyRate = comet.getSupplyRate(comet.getUtilization());
        success = true;
    }

    function getBorrowRate(address token) external view whenCometExists(token) returns (uint256 borrowRate, bool success) {
        ICompoundComet comet = getComet(token);
        borrowRate = comet.getBorrowRate(comet.getUtilization());
        success = true;
    }

    function getBaseToken(ICompoundComet comet) external view returns (address) {
        return comet.baseToken();
    }

    function getBalance(address token, address user) external view returns (uint256) {
        ICompoundComet comet = getComet(token);
        return comet.balanceOf(user);
    }

    function getBorrowBalance(address token, address user) public view returns (uint256) {
        ICompoundComet comet = getComet(token);
        return comet.borrowBalanceOf(user);
    }

    function getBorrowBalanceCurrent(address token, address user) external view returns (uint256) {
        return getBorrowBalance(token, user);
    }

    function getLtv(address token, address user) external view returns (uint256) {
        ICompoundComet comet = getComet(token);
        (uint256 totalCollateralValue, uint256 totalBorrowAdjusted) = _collateralTotalsWithFactor(comet, user, false);

        if (totalCollateralValue == 0) return 0;

        return (totalBorrowAdjusted * 10_000) / totalCollateralValue;
    }

    function getMaxLtv(address token, address user) external view returns (uint256) {
        ICompoundComet comet = getComet(token);
        (uint256 totalCollValue, uint256 totalLiqAdjValue) = _collateralTotalsWithFactor(comet, user, true);

        if (totalCollValue == 0) return 0;

        return (totalLiqAdjValue * 10_000) / totalCollValue;
    }

    /// @notice Returns the current LTV (debt/collateral) in basis points
    /// @dev This is the actual current LTV = totalDebt / totalCollateral * 10000
    /// @param token The base token (market identifier)
    /// @param user The user address
    /// @return Current LTV in basis points (e.g., 6500 = 65%)
    function getCurrentLtvBps(address token, address user) external view returns (uint256) {
        ICompoundComet comet = getComet(token);

        // Get raw borrow balance (in base token units)
        uint256 borrowBalance = comet.borrowBalanceOf(user);
        if (borrowBalance == 0) return 0;

        // Get total collateral value (in base token units via oracle)
        (uint256 totalCollateralValue,) = _collateralTotalsWithFactor(comet, user, false);
        if (totalCollateralValue == 0) return 0;

        // Convert borrow balance to same scale as collateral value
        // borrowBalance is in base token units, collateralValue is in price-scaled units
        // We need to scale borrowBalance by the base token's price
        address baseToken = comet.baseToken();
        address basePriceFeed = comet.baseTokenPriceFeed();
        uint256 basePrice = comet.getPrice(basePriceFeed);
        uint256 baseScale = 10 ** IERC20Metadata(baseToken).decimals();

        uint256 borrowValue = (borrowBalance * basePrice) / baseScale;

        return (borrowValue * 10_000) / totalCollateralValue;
    }

    /// @notice Returns the liquidation LTV threshold in basis points
    /// @dev Position is liquidatable when currentLTV >= liquidationLtvBps
    /// @param token The base token (market identifier)
    /// @param user The user address
    /// @return Weighted liquidation threshold in basis points
    function getLiquidationLtvBps(address token, address user) external view returns (uint256) {
        ICompoundComet comet = getComet(token);
        (uint256 totalCollValue, uint256 totalLiqAdjValue) = _collateralTotalsWithFactor(comet, user, true);

        if (totalCollValue == 0) return 0;

        // Liquidation threshold = liquidateCollateralFactor weighted by collateral
        return (totalLiqAdjValue * 10_000) / totalCollValue;
    }

    function getPossibleCollaterals(address token, address user) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        (address[] memory collaterals, uint128[] memory rawBalances, string[] memory displayNames) = getDepositedCollaterals(token, user);
        
        // Count non-zero balances
        uint256 nonZeroCount = 0;
        for (uint256 i = 0; i < rawBalances.length; i++) {
            if (rawBalances[i] > 0) {
                nonZeroCount++;
            }
        }

        // Create new arrays with only non-zero balances
        collateralAddresses = new address[](nonZeroCount);
        balances = new uint256[](nonZeroCount);
        symbols = new string[](nonZeroCount);
        decimals = new uint8[](nonZeroCount);

        // Fill arrays with non-zero balance entries
        uint256 j = 0;
        for (uint256 i = 0; i < rawBalances.length; i++) {
            if (rawBalances[i] > 0) {
                collateralAddresses[j] = collaterals[i];
                balances[j] = uint256(rawBalances[i]);
                symbols[j] = displayNames[i];
                decimals[j] = IERC20Metadata(collaterals[i]).decimals();
                j++;
            }
        }
    }

    function getDepositedCollaterals(address token, address account)
        public
        view
        returns (address[] memory collaterals, uint128[] memory balances, string[] memory displayNames)
    {
        ICompoundComet comet = getComet(token);
        uint8 n = comet.numAssets();        
        // Allocate arrays of the correct size.
        collaterals = new address[](n);
        displayNames = new string[](n);
        balances = new uint128[](n);
        
        uint256 index = 0;
        // Populate the arrays with assets that have a nonzero balance.
        for (uint8 i = 0; i < n; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            (uint128 bal, ) = comet.userCollateral(account, info.asset);
            collaterals[index] = info.asset;
            displayNames[index] = ERC20(info.asset).symbol();
            balances[index] = bal;
            index++;
        }
    }

    function getPrice(address token) public view returns (uint256) {
        if (address(overrideFeeds[token]) != address(0))   {
            (, int256 price,,,) = overrideFeeds[token].latestRoundData();
            return uint256(price);
        }

        ICompoundComet comet = getComet(token);
        address theirFeed = comet.baseTokenPriceFeed();
        if (theirFeed != address(0)) {
            return comet.getPrice(theirFeed);
        }

        return 0;
    }

    function getCollateralPrice(address market, address asset) public view returns (uint256) {
        ICompoundComet comet = getComet(market);
        ICompoundComet.AssetInfo memory info = comet.getAssetInfoByAddress(asset);
        return comet.getPrice(info.priceFeed);
    }

    function getPrices(address market, address[] calldata tokens) public view returns (uint256[] memory) {
        uint256[] memory prices = new uint256[](tokens.length);
        
        for (uint i = 0; i < tokens.length; i++) {
            prices[i] = getCollateralPrice(market, tokens[i]);
        }
        
        return prices;
    }

    function getCompoundData(address token, address account)
        external
        view
        returns (
            uint256 supplyRate,
            uint256 borrowRate,
            uint256 balance,
            uint256 borrowBalance,
            uint256 price,
            uint256 priceScale
        )
    {
        ICompoundComet comet = getComet(token);
        supplyRate = comet.getSupplyRate(comet.getUtilization());
        borrowRate = comet.getBorrowRate(comet.getUtilization());
        balance = comet.balanceOf(account);
        borrowBalance = comet.borrowBalanceOf(account);
        price = getPrice(token);
        priceScale = comet.priceScale();
    }

    function isCollateralSupported(address market, address collateral) external view returns (bool isSupported) {
        ICompoundComet comet;
        try this.getComet(market) returns (ICompoundComet c) {
            comet = c;
        } catch {
            return false;
        }
        
        // Iterate through all assets to find if the collateral is supported
        uint8 numAssets = comet.numAssets();
        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            if (info.asset == collateral) {
                return true;
            }
        }
        
        return false;
    }
    
    function getSupportedCollaterals(address market) external view returns (address[] memory collateralAddresses) {
        ICompoundComet comet;
        try this.getComet(market) returns (ICompoundComet c) {
            comet = c;
        } catch {
            return new address[](0);
        }
        
        uint8 numAssets = comet.numAssets();
        collateralAddresses = new address[](numAssets);
        
        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            collateralAddresses[i] = info.asset;
        }

        return collateralAddresses;
    }

    function getCollateralFactors(address market)
        external
        view
        returns (address[] memory assets, uint256[] memory ltvBps, uint256[] memory lltvBps)
    {
        ICompoundComet comet = getComet(market);
        uint8 numAssets = comet.numAssets();

        assets = new address[](numAssets);
        ltvBps = new uint256[](numAssets);
        lltvBps = new uint256[](numAssets);

        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            assets[i] = info.asset;
            ltvBps[i] = (uint256(info.borrowCollateralFactor) * 10_000) / 1e18;
            lltvBps[i] = (uint256(info.liquidateCollateralFactor) * 10_000) / 1e18;
        }
    }

    /// @notice Reserve configuration for LTV calculations (matches Aave/Venus pattern)
    struct ReserveConfigData {
        address token;
        uint256 price;              // Price from Comet oracle (8 decimals typically)
        uint256 ltv;                // Borrow collateral factor in basis points (0-10000)
        uint256 liquidationThreshold; // Liquidate collateral factor in basis points
        uint8 decimals;
        uint64 scale;               // Compound's scale for this asset
    }

    /// @notice Get reserve configuration data for a Compound market (for frontend LTV calculations)
    /// @dev Returns price, LTV (borrow collateral factor), liquidation threshold for each collateral
    /// @param market The base token address (e.g., USDC) to identify the Comet
    /// @return configs Array of reserve configuration data for all collaterals in this market
    function getReserveConfigs(address market) external view returns (ReserveConfigData[] memory configs) {
        ICompoundComet comet = getComet(market);
        uint8 numAssets = comet.numAssets();

        configs = new ReserveConfigData[](numAssets);

        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);

            // Get price from Comet's oracle
            uint256 price = comet.getPrice(info.priceFeed);

            // Get decimals
            uint8 dec = 18;
            try ERC20(info.asset).decimals() returns (uint8 d) {
                dec = d;
            } catch {}

            configs[i] = ReserveConfigData({
                token: info.asset,
                price: price,
                ltv: (uint256(info.borrowCollateralFactor) * 10_000) / 1e18,
                liquidationThreshold: (uint256(info.liquidateCollateralFactor) * 10_000) / 1e18,
                decimals: dec,
                scale: info.scale
            });
        }
    }

    /// @notice Get base token info for a market (debt token)
    /// @param market The base token address
    /// @return baseToken The base token address
    /// @return price The base token price
    /// @return decimals The base token decimals
    /// @return priceScale The Comet's price scale
    function getBaseTokenInfo(address market) external view returns (
        address baseToken,
        uint256 price,
        uint8 decimals,
        uint256 priceScale
    ) {
        ICompoundComet comet = getComet(market);
        baseToken = comet.baseToken();
        price = getPrice(market);
        priceScale = comet.priceScale();
        
        try ERC20(baseToken).decimals() returns (uint8 d) {
            decimals = d;
        } catch {
            decimals = 18;
        }
    }

    /// @notice Get position value for ADL trigger calculation
    /// @dev Returns collateral and debt values in 8-decimal USD (Comet's priceScale)
    /// @param market The base token (market identifier)
    /// @param user The user address
    /// @return collateralValueUsd Total collateral value in 8-decimal USD
    /// @return debtValueUsd Total debt value in 8-decimal USD
    function getPositionValue(address market, address user)
        external
        view
        returns (uint256 collateralValueUsd, uint256 debtValueUsd)
    {
        ICompoundComet comet = getComet(market);

        // Collateral value (already in priceScale = 8 decimals)
        (collateralValueUsd,) = _collateralTotalsWithFactor(comet, user, false);

        // Debt value: borrowBalance * basePrice / baseScale
        uint256 borrowBalance = comet.borrowBalanceOf(user);
        if (borrowBalance > 0) {
            address baseToken = comet.baseToken();
            address basePriceFeed = comet.baseTokenPriceFeed();
            uint256 basePrice = comet.getPrice(basePriceFeed);
            uint256 baseScale = 10 ** IERC20Metadata(baseToken).decimals();
            debtValueUsd = (borrowBalance * basePrice) / baseScale;
        }
    }

    function _collateralTotalsWithFactor(ICompoundComet comet, address account, bool useLiquidationFactor)
        internal
        view
        returns (uint256 totalCollateralValue, uint256 totalAdjusted)
    {
        uint8 numAssets = comet.numAssets();
        for (uint8 i = 0; i < numAssets; i++) {
            ICompoundComet.AssetInfo memory info = comet.getAssetInfo(i);
            (uint128 colBalance,) = comet.userCollateral(account, info.asset);

            if (colBalance == 0) continue;

            uint256 price = comet.getPrice(info.priceFeed);
            uint256 collateralValue = (uint256(colBalance) * price) / uint256(info.scale);

            totalCollateralValue += collateralValue;
            uint256 factor = useLiquidationFactor
                ? uint256(info.liquidateCollateralFactor)
                : uint256(info.borrowCollateralFactor);
            totalAdjusted += (collateralValue * factor) / 1e18;
        }
    }
}

