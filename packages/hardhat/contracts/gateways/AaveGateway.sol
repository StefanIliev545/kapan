// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ProtocolGateway } from "./ProtocolGateway.sol";
import { IGateway } from "../interfaces/IGateway.sol";
import { IPoolAddressesProvider } from "../interfaces/aave/IPoolAddressesProvider.sol";
import { IUiPoolDataProviderV3 } from "../interfaces/aave/IUiDataProvider.sol";
import { IPool } from "@aave/core-v3/contracts/interfaces/IPool.sol";
import { IAToken } from "@aave/core-v3/contracts/interfaces/IAToken.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPoolDataProvider } from "@aave/core-v3/contracts/interfaces/IPoolDataProvider.sol";

interface DebtToken {
    function borrowAllowance(address user, address spender) external view returns (uint256);
}

contract AaveGateway is IGateway, ProtocolGateway, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IPoolAddressesProvider public immutable poolAddressesProvider;
    IUiPoolDataProviderV3 public immutable uiPoolDataProvider;
    uint16 public immutable REFERRAL_CODE;

    constructor(address router, address _poolAddressesProvider, address _uiPoolDataProvider, uint16 _referralCode) ProtocolGateway(router) {
        poolAddressesProvider = IPoolAddressesProvider(_poolAddressesProvider);
        uiPoolDataProvider = IUiPoolDataProviderV3(_uiPoolDataProvider);
        REFERRAL_CODE = _referralCode;
    }

    // Placeholder for getLtv
    function getLtv(address token, address user) external view returns (uint256) {
        // TODO: Implement LTV logic
    }

    function deposit(address token, address user, uint256 amount) public override nonReentrant {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(poolAddress, amount);
        IPool(poolAddress).supply(token, amount, user, REFERRAL_CODE);
    }

    function depositCollateral(address market, address collateral, uint256 amount, address receiver) external override {
        deposit(collateral, receiver, amount);
    }

    function withdrawCollateral(address, address token, address user, uint256 amount) external override onlyRouter returns (address, uint256) {
        address aToken = getAToken(token);
        IERC20 atoken = IERC20(aToken);
        
        require(atoken.balanceOf(user) >= amount, "Insufficient balance of atokens");
        uint256 allowance = atoken.allowance(user, address(this));
        require(allowance >= amount, "Insufficient allowance");
        atoken.transferFrom(user, address(this), amount);

        address underlying = IAToken(aToken).UNDERLYING_ASSET_ADDRESS();
        IPool(poolAddressesProvider.getPool()).withdraw(underlying, amount, address(this));

        IERC20(underlying).safeTransfer(msg.sender, amount);
        return (underlying, amount);
    }

    function borrow(address token, address user, uint256 amount) external override onlyRouterOrSelf(user) nonReentrant {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");

        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        require(found && variableDebtToken != address(0), "Token is not a valid debt token");
        uint256 allowance = DebtToken(variableDebtToken).borrowAllowance(user, address(this));
        require(allowance >= amount, "Insufficient borrow allowance");

        IPool(poolAddress).borrow(token, amount, 2, REFERRAL_CODE, user);
        IERC20(token).safeTransfer(msg.sender, amount);
    }

    function repay(address token, address user, uint256 amount) external override nonReentrant {
        address poolAddress = poolAddressesProvider.getPool();
        require(poolAddress != address(0), "Pool address not set");
    
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(token).approve(poolAddress, amount);
        IPool(poolAddress).repay(token, amount, 2, user);
    }

    struct TokenInfo {
        address token;
        uint256 supplyRate;
        uint256 borrowRate;
        string name;
        string symbol;
        uint256 price;
        uint256 borrowBalance;
        uint256 balance;
        address aToken;
    }

    /// @notice Returns all token info for a given user.
    /// @dev This function caches the reserves and user reserves data to avoid multiple heavy calls.
    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        // Fetch reserves data once.
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        // Fetch user reserves data once.
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);

        TokenInfo[] memory tokens = new TokenInfo[](reserves.length);
        for (uint256 i = 0; i < reserves.length; i++) {
            uint256 balance = _getBalanceFromReserveData(reserves[i], user, userReserves);
            uint256 borrowBalance = _getBorrowBalanceFromReserveData(reserves[i], user, userReserves);
            tokens[i] = TokenInfo(
                reserves[i].underlyingAsset,
                reserves[i].liquidityRate,
                reserves[i].variableBorrowRate,
                reserves[i].name,
                reserves[i].symbol,
                reserves[i].priceInMarketReferenceCurrency,
                borrowBalance,
                balance,
                reserves[i].aTokenAddress
            );
        }
        return tokens;
    }

    function getBorrowRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = 
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].variableBorrowRate, true);
            }
        }
        return (0, false);
    }

    function getSupplyRate(address token) external view override returns (uint256, bool) {
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves, ) = 
            uiPoolDataProvider.getReservesData(poolAddressesProvider);
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == token) {
                return (reserves[i].liquidityRate, true);
            }
        }
        return (0, false);
    }

    /// @notice Gets the balance for a given token and user.
    /// @dev First attempts to call balanceOf on the associated aToken; if that fails, falls back to user reserves data.
    function getBalance(address token, address user) public view override returns (uint256) {
        (address aToken, , bool found) = _getReserveAddresses(token);
        if (found && aToken != address(0)) {
            try IERC20(aToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
            }
        }
        // Fallback: use user reserves data
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    /// @notice Gets the borrow balance for a given token and user.
    /// @dev First attempts to call balanceOf on the associated variable debt token; if that fails, falls back to user reserves data.
    function getBorrowBalance(address token, address user) public view override returns (uint256) {
        (, address variableDebtToken, bool found) = _getReserveAddresses(token);
        if (found && variableDebtToken != address(0)) {
            try IERC20(variableDebtToken).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
            }
        }
        // Fallback: use user reserves data
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }

    function getBorrowBalanceCurrent(address token, address user) external override returns (uint256) {
        return getBorrowBalance(token, user);
    }

    /// @notice Returns the list of tokens that the user has borrowed.
    function borrowedTokens(address user) external view returns (address[] memory) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        uint256 count = 0;
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].scaledVariableDebt > 0) {
                count++;
            }
        }
        address[] memory tokens = new address[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].scaledVariableDebt > 0) {
                tokens[index++] = userReserves[i].underlyingAsset;
            }
        }
        return tokens;
    }

    /// @dev Internal helper to get both the aToken and variable debt token for a given underlying asset.
    function _getReserveAddresses(address token) internal view returns (address aToken, address variableDebtToken, bool found) {
        try uiPoolDataProvider.getReservesData(poolAddressesProvider) returns (
            IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,
            IUiPoolDataProviderV3.BaseCurrencyInfo memory
        ) {
            for (uint256 i = 0; i < reserves.length; i++) {
                if (reserves[i].underlyingAsset == token) {
                    return (reserves[i].aTokenAddress, reserves[i].variableDebtTokenAddress, true);
                }
            }
        } catch {
        }
        return (address(0), address(0), false);
    }

    /// @dev Internal helper to fetch balance from reserve data, with fallback to user reserves.
    function _getBalanceFromReserveData(
        IUiPoolDataProviderV3.AggregatedReserveData memory reserve,
        address user,
        IUiPoolDataProviderV3.UserReserveData[] memory userReserves
    ) internal view returns (uint256) {
        if (reserve.aTokenAddress != address(0)) {
            try IERC20(reserve.aTokenAddress).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
                // Fallback below
            }
        }
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == reserve.underlyingAsset) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    /// @dev Internal helper to fetch borrow balance from reserve data, with fallback to user reserves.
    function _getBorrowBalanceFromReserveData(
        IUiPoolDataProviderV3.AggregatedReserveData memory reserve,
        address user,
        IUiPoolDataProviderV3.UserReserveData[] memory userReserves
    ) internal view returns (uint256) {
        if (reserve.variableDebtTokenAddress != address(0)) {
            try IERC20(reserve.variableDebtTokenAddress).balanceOf(user) returns (uint256 bal) {
                return bal;
            } catch {
                // Fallback below
            }
        }
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == reserve.underlyingAsset) {
                return userReserves[i].scaledVariableDebt;
            }
        }
        return 0;
    }
    
    function getScaledBalance(address token, address user) private view returns (uint256) {
        (IUiPoolDataProviderV3.UserReserveData[] memory userReserves, ) = 
            uiPoolDataProvider.getUserReservesData(poolAddressesProvider, user);
        for (uint256 i = 0; i < userReserves.length; i++) {
            if (userReserves[i].underlyingAsset == token) {
                return userReserves[i].scaledATokenBalance;
            }
        }
        return 0;
    }

    function getPossibleCollaterals(address token, address user) external view returns (
        address[] memory collateralAddresses,
        uint256[] memory balances,
        string[] memory symbols,
        uint8[] memory decimals
    ) {
        // If user is zero address, get all possible tokens but with zero balances
        if (user == address(0)) {
            (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
            
            // Initialize arrays with all reserves
            uint256 tokenCountX = reserves.length;
            collateralAddresses = new address[](tokenCountX);
            balances = new uint256[](tokenCountX); // All zeros by default
            symbols = new string[](tokenCountX);
            decimals = new uint8[](tokenCountX);
            
            // Fill arrays with token data (zero balances)
            for (uint256 i = 0; i < tokenCountX; i++) {
                collateralAddresses[i] = reserves[i].underlyingAsset;
                symbols[i] = reserves[i].symbol;
                // Get decimals directly from token
                try ERC20(reserves[i].underlyingAsset).decimals() returns (uint8 dec) {
                    decimals[i] = dec;
                } catch {
                    decimals[i] = 18; // Default to 18 if call fails
                }
            }
            
            return (collateralAddresses, balances, symbols, decimals);
        }
        
        // For connected wallets, get all tokens with actual balances
        TokenInfo[] memory allTokens = this.getAllTokensInfo(user);

        // Count tokens with non-zero balance
        uint256 tokenCount = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (allTokens[i].balance > 0) {
                tokenCount++;
            }
        }

        // Initialize arrays with the correct size
        collateralAddresses = new address[](tokenCount);
        balances = new uint256[](tokenCount);
        symbols = new string[](tokenCount);
        decimals = new uint8[](tokenCount);

        // Fill arrays with tokens that have balance
        uint256 index = 0;
        for (uint256 i = 0; i < allTokens.length; i++) {
            if (allTokens[i].balance > 0) {
                collateralAddresses[index] = allTokens[i].token;
                balances[index] = allTokens[i].balance;
                symbols[index] = allTokens[i].symbol;
                try ERC20(allTokens[i].token).decimals() returns (uint8 dec) {
                    decimals[index] = dec;
                } catch {
                    decimals[index] = 18; // Default to 18 if call fails
                }
                index++;
            }
        }
        return (collateralAddresses, balances, symbols, decimals);
    }

    function getEncodedCollateralApprovals(address token, Collateral[] calldata collaterals) external view returns (address[] memory target, bytes[] memory data) {
        target = new address[](collaterals.length);
        data = new bytes[](collaterals.length);
        for (uint256 i = 0; i < collaterals.length; i++) {
            target[i] = getAToken(collaterals[i].token);
            data[i] = abi.encodeWithSelector(IERC20.approve.selector, address(this), collaterals[i].amount);
        }
    }

    function getEncodedDebtApproval(address token, uint256 amount) external view returns (address[] memory target, bytes[] memory data) {
        (,address variableDebtToken , bool found) = _getReserveAddresses(token);
        require(found && variableDebtToken != address(0), "Token is not a valid debt token");
        target = new address[](1);
        data = new bytes[](1);
        target[0] = variableDebtToken;
        // todo - determine if max is ok, its hard to get the exact amount right if we wanna transfer all.. 
        data[0] = abi.encodeWithSignature("approveDelegation(address,uint256)", address(this), type(uint256).max);
    }

    function getAToken(address underlyingToken) public view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(IPoolAddressesProvider(poolAddressesProvider).getPoolDataProvider());
        (address aTokenAddress, , ) = dataProvider.getReserveTokensAddresses(underlyingToken);
        return aTokenAddress;
    }

    function getUnderlyingToken(address aToken) external view returns (address) {
        IPoolDataProvider dataProvider = IPoolDataProvider(IPoolAddressesProvider(poolAddressesProvider).getPoolDataProvider());
        (address underlyingToken, , ) = dataProvider.getReserveTokensAddresses(aToken);
        return underlyingToken;
    }

    /**
     * @notice Check if a collateral token is supported for a specific market in Aave
     * @param market The address of the market token (not used in Aave as all collaterals are cross-market)
     * @param collateral The address of the collateral token to check
     * @return isSupported Whether the collateral is supported in Aave
     */
    function isCollateralSupported(address market, address collateral) external view override returns (bool isSupported) {
        // In Aave, we need to check if the token is a supported reserve and if it can be used as collateral
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].underlyingAsset == collateral) {
                // Check if the token can be used as collateral in Aave
                return reserves[i].usageAsCollateralEnabled;
            }
        }
        
        return false;
    }
    
    /**
     * @notice Get all supported collaterals for a specific market in Aave
     * @param market The address of the market token (not used in Aave as all collaterals are cross-market)
     * @return collateralAddresses Array of supported collateral token addresses
     */
    function getSupportedCollaterals(address market) external view override returns (address[] memory collateralAddresses) {
        // Get all Aave reserves
        (IUiPoolDataProviderV3.AggregatedReserveData[] memory reserves,) = uiPoolDataProvider.getReservesData(poolAddressesProvider);
        
        // Count eligible collaterals
        uint256 collateralCount = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].usageAsCollateralEnabled) {
                collateralCount++;
            }
        }
        
        // Create and populate array with eligible collaterals
        collateralAddresses = new address[](collateralCount);
        uint256 index = 0;
        for (uint256 i = 0; i < reserves.length; i++) {
            if (reserves[i].usageAsCollateralEnabled) {
                collateralAddresses[index] = reserves[i].underlyingAsset;
                index++;
            }
        }
        
        return collateralAddresses;
    }
}
