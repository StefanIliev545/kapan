// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEVC} from "../interfaces/euler/IEVC.sol";

contract MockEulerVault is ERC20 {
    IERC20 public immutable assetToken;
    IEVC public immutable evc;

    mapping(address => uint256) public debt;
    uint8 private immutable _decimals;
    uint256 private _totalAssets;

    constructor(address asset_, address evc_, uint8 decimals_) ERC20("Mock Euler Vault", "mev") {
        assetToken = IERC20(asset_);
        evc = IEVC(evc_);
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function asset() external view returns (address) {
        return address(assetToken);
    }

    function underlyingAsset() external view returns (address) {
        return address(assetToken);
    }

    function deposit(uint256 assets, address receiver) external returns (uint256 shares) {
        assetToken.transferFrom(msg.sender, address(this), assets);
        shares = convertToShares(assets);
        _mint(receiver, shares);
        _totalAssets += assets;
    }

    function withdraw(uint256 assets, address receiver, address owner) external returns (uint256 shares) {
        shares = convertToShares(assets);
        if (msg.sender != owner) {
            uint256 current = allowance(owner, msg.sender);
            require(current >= shares, "insufficient allowance");
            _approve(owner, msg.sender, current - shares);
        }
        _burn(owner, shares);
        _totalAssets -= assets;
        assetToken.transfer(receiver, assets);
    }

    function redeem(uint256 shares, address receiver, address owner) external returns (uint256 assets) {
        assets = convertToAssets(shares);
        if (msg.sender != owner) {
            uint256 current = allowance(owner, msg.sender);
            require(current >= shares, "insufficient allowance");
            _approve(owner, msg.sender, current - shares);
        }
        _burn(owner, shares);
        _totalAssets -= assets;
        assetToken.transfer(receiver, assets);
    }

    function borrow(uint256 amount, address receiver) external returns (uint256) {
        address account;
        try evc.currentAccount() returns (address acct) {
            account = acct;
        } catch {}
        if (account == address(0)) {
            account = receiver;
        }
        debt[account] += amount;
        assetToken.transfer(receiver, amount);
        return amount;
    }

    function repay(uint256 amount, address onBehalfOf) external returns (uint256) {
        assetToken.transferFrom(msg.sender, address(this), amount);
        uint256 owed = debt[onBehalfOf];
        uint256 pay = owed < amount ? owed : amount;
        debt[onBehalfOf] = owed - pay;
        _totalAssets += pay;
        return pay;
    }

    function maxWithdraw(address owner) external view returns (uint256) {
        return convertToAssets(balanceOf(owner));
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares;
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return assets;
    }

    function totalAssets() public view returns (uint256) {
        return _totalAssets;
    }

    function totalSupplyWithAssets() external view returns (uint256, uint256) {
        return (totalSupply(), _totalAssets);
    }

    function debtOf(address account) external view returns (uint256) {
        return debt[account];
    }
}
