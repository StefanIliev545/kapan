// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import {IEulerVault} from "../../interfaces/euler/IEulerVault.sol";
import {IEulerPriceOracle} from "../../interfaces/euler/IEulerPriceOracle.sol";

/// @title EulerGatewayView
/// @notice View-only gateway surfacing Euler market and position data for the frontend
contract EulerGatewayView is Ownable {
    IEulerPriceOracle public immutable priceOracle;

    mapping(address => IEulerVault) public tokenToVault;

    address[] private _vaults;
    mapping(address => bool) private _isRegistered;

    struct TokenInfo {
        address token;
        address vault;
        uint256 supplyRate;
        uint256 borrowRate;
        string name;
        string symbol;
        uint256 price;
        uint256 borrowBalance;
        uint256 balance;
        uint8 decimals;
    }

    event EulerMarketAdded(address indexed token, address indexed vault);

    constructor(address _priceOracle, address owner_) Ownable(owner_) {
        priceOracle = IEulerPriceOracle(_priceOracle);
    }

    function addEulerMarket(address vault) external onlyOwner {
        address underlying = _getUnderlying(vault);
        require(underlying != address(0), "Euler: underlying missing");
        tokenToVault[underlying] = IEulerVault(vault);
        if (!_isRegistered[vault]) {
            _isRegistered[vault] = true;
            _vaults.push(vault);
        }
        emit EulerMarketAdded(underlying, vault);
    }

    function allVaults() external view returns (address[] memory) {
        return _vaults;
    }

    function getAllEulerMarkets()
        external
        view
        returns (
            address[] memory vaults,
            address[] memory tokens,
            string[] memory symbols,
            uint8[] memory decimals_,
            uint256[] memory prices
        )
    {
        uint256 len = _vaults.length;
        vaults = new address[](len);
        tokens = new address[](len);
        symbols = new string[](len);
        decimals_ = new uint8[](len);
        prices = new uint256[](len);

        for (uint256 i = 0; i < len; i++) {
            IEulerVault vault = IEulerVault(_vaults[i]);
            address token = _getUnderlying(address(vault));
            (string memory name_, string memory symbol_, uint8 dec) = _metadata(token);
            vaults[i] = address(vault);
            tokens[i] = token;
            symbols[i] = bytes(symbol_).length > 0 ? symbol_ : name_;
            decimals_[i] = dec;
            prices[i] = _getPrice(token);
        }
    }

    function getAllTokensInfo(address user) external view returns (TokenInfo[] memory) {
        uint256 len = _vaults.length;
        TokenInfo[] memory tokens = new TokenInfo[](len);

        for (uint256 i = 0; i < len; i++) {
            IEulerVault vault = IEulerVault(_vaults[i]);
            address underlying = _getUnderlying(address(vault));
            (string memory name_, string memory symbol_, uint8 dec) = _metadata(underlying);

            tokens[i] = TokenInfo({
                token: underlying,
                vault: address(vault),
                supplyRate: 0,
                borrowRate: 0,
                name: name_,
                symbol: bytes(symbol_).length > 0 ? symbol_ : name_,
                price: _getPrice(underlying),
                borrowBalance: getBorrowBalance(underlying, user),
                balance: getBalance(underlying, user),
                decimals: dec
            });
        }
        return tokens;
    }

    function getBalance(address token, address user) public view returns (uint256) {
        IEulerVault vault = tokenToVault[token];
        if (address(vault) == address(0)) return 0;

        uint256 shares = vault.balanceOf(user);
        if (shares == 0) return 0;

        try vault.convertToAssets(shares) returns (uint256 assets) {
            return assets;
        } catch {
            uint256 supply = vault.totalSupply();
            uint256 assets = vault.totalAssets();
            if (supply == 0) return 0;
            return (shares * assets) / supply;
        }
    }

    function getBorrowBalance(address token, address user) public view returns (uint256) {
        IEulerVault vault = tokenToVault[token];
        if (address(vault) == address(0)) return 0;
        try vault.debtOf(user) returns (uint256 bal) {
            return bal;
        } catch {
            return 0;
        }
    }

    function _metadata(address token) internal view returns (string memory name_, string memory symbol_, uint8 dec) {
        dec = 18;
        try ERC20(token).name() returns (string memory n) {
            name_ = n;
        } catch {}
        try ERC20(token).symbol() returns (string memory s) {
            symbol_ = s;
        } catch {}
        try ERC20(token).decimals() returns (uint8 d) {
            dec = d;
        } catch {}
    }

    function _getPrice(address token) internal view returns (uint256) {
        if (address(priceOracle) == address(0)) return 0;
        try priceOracle.getPrice(token) returns (uint256 p) {
            return p;
        } catch {
            return 0;
        }
    }

    function _getUnderlying(address vault) internal view returns (address) {
        try IEulerVault(vault).underlyingAsset() returns (address token) {
            return token;
        } catch {}
        try IEulerVault(vault).asset() returns (address token) {
            return token;
        } catch {}
        return address(0);
    }
}
