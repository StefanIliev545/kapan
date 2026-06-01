// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ProtocolGateway } from "../../../gateways/ProtocolGateway.sol";
import { IGateway } from "../../interfaces/IGateway.sol";
import { ProtocolTypes } from "../../interfaces/ProtocolTypes.sol";
import { IAlchemistV3 } from "../../interfaces/alchemix/IAlchemistV3.sol";
import { IAlchemistV3Position } from "../../interfaces/alchemix/IAlchemistV3Position.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC4626 } from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import { IERC721 } from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AlchemixGatewayWrite
 * @notice Kapan write gateway for Alchemix V3.
 *
 * Architecture summary
 * --------------------
 * - Each Alchemist instance is configured for one (yieldToken, debtToken, underlyingToken)
 *   triple. The yieldToken is an ERC4626 "MYT" (Meta-Yield Token, a Morpho V2 vault).
 * - Positions are ERC721 NFTs. `tokenId == 0` passed to `deposit` mints a fresh NFT to `recipient`.
 * - `withdraw` and `mint` require msg.sender to *own* the NFT (no operator bypass).
 *   `mintFrom` works via pre-approved `mintAllowance`.
 * - `burn` repays only UNEARMARKED debt using alAsset; `repay` covers both portions using MYT.
 *
 * Market registry
 * ---------------
 * To prevent address-spoofing attacks via crafted instruction contexts (a malicious
 * caller could otherwise route the gateway through a fake ERC4626 and trap funds in
 * the gateway for later draining), every Alchemix market must be registered by the
 * gateway owner via `registerMarket(address alchemist)`. At registration time the
 * gateway pulls MYT/underlying/debtToken/positionNFT *from the alchemist itself* and
 * verifies `IERC4626(myt).asset() == underlying`. There is no other way to introduce
 * a market — instruction processing always reads from this storage.
 *
 * Context encoding for {LendingInstruction}
 * -----------------------------------------
 *   bytes context = abi.encode(
 *     uint256 marketId,     // returned by registerMarket; resolves to a Market struct
 *     uint256 tokenId       // 0 only valid for Deposit / DepositCollateral
 *   )
 *
 * Token field semantics per op (with auto-wrap/unwrap on the underlying↔MYT boundary)
 * ----------------------------------------------------------------------------------
 *   Deposit / DepositCollateral : token == underlying (auto-wrap) OR token == myt (direct)
 *   WithdrawCollateral          : token == underlying (auto-unwrap) OR token == myt (direct)
 *   Borrow                      : token == debtToken
 *   Repay                       : token == debtToken (uses burn) OR underlying/myt (uses repay)
 *   GetBorrowBalance            : token == debtToken
 *   GetSupplyBalance            : token == underlying (normalized) OR token == myt (raw)
 */
contract AlchemixGatewayWrite is IGateway, ProtocolGateway, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ZeroAddress();
    error InvalidContext();
    error TokenMismatch();
    error TokenIdRequired();
    error UnsupportedOperation();
    error MarketNotRegistered(uint256 marketId);
    error MarketAlreadyRegistered(address alchemist);
    error MytAssetMismatch(address myt, address asset, address underlying);

    /// @notice One registered Alchemix market — one alchemist instance, fully derived from the
    ///         alchemist itself. All fields are populated at registration time and immutable
    ///         thereafter (markets can be marked inactive but never re-pointed).
    struct Market {
        address alchemist;
        address myt;
        address underlying;
        address debtToken;
        address positionNft;
        bool active;
    }

    /// @notice marketId => Market. marketId is 1-indexed; 0 is reserved as "unset".
    mapping(uint256 => Market) public markets;

    /// @notice Reverse index for off-chain enumeration / dedup at registration time.
    mapping(address => uint256) public alchemistToMarketId;

    /// @notice Monotonic counter; first registered market gets id=1.
    uint256 public marketCount;

    event MarketRegistered(
        uint256 indexed marketId,
        address indexed alchemist,
        address myt,
        address underlying,
        address debtToken,
        address positionNft
    );
    event MarketSetActive(uint256 indexed marketId, bool active);

    constructor(address router, address owner_) ProtocolGateway(router) Ownable(owner_) {}

    // ============ Market registry ============

    /// @notice Register a new Alchemix market. Pulls all dependent addresses from the alchemist
    ///         itself so callers cannot spoof MYT/underlying/debtToken via context.
    /// @return marketId Newly assigned 1-indexed market id.
    function registerMarket(address alchemist) external onlyOwner returns (uint256 marketId) {
        if (alchemist == address(0)) revert ZeroAddress();
        if (alchemistToMarketId[alchemist] != 0) revert MarketAlreadyRegistered(alchemist);

        IAlchemistV3 a = IAlchemistV3(alchemist);
        address myt = a.myt();
        address underlying = a.underlyingToken();
        address debtToken = a.debtToken();
        address positionNft = a.alchemistPositionNFT();

        if (myt == address(0) || underlying == address(0) || debtToken == address(0) || positionNft == address(0)) {
            revert ZeroAddress();
        }

        // Verify the MYT really wraps the declared underlying — defends against a misconfigured
        // alchemist where yieldToken/underlyingToken don't agree on what `IERC4626(myt).asset()` is.
        address mytAsset = IERC4626(myt).asset();
        if (mytAsset != underlying) revert MytAssetMismatch(myt, mytAsset, underlying);

        marketId = ++marketCount;
        markets[marketId] = Market({
            alchemist: alchemist,
            myt: myt,
            underlying: underlying,
            debtToken: debtToken,
            positionNft: positionNft,
            active: true
        });
        alchemistToMarketId[alchemist] = marketId;

        emit MarketRegistered(marketId, alchemist, myt, underlying, debtToken, positionNft);
    }

    /// @notice Disable or re-enable an existing market without removing its id (so historical
    ///         positions can still query / repay / withdraw against it).
    function setMarketActive(uint256 marketId, bool active) external onlyOwner {
        if (marketId == 0 || marketId > marketCount) revert MarketNotRegistered(marketId);
        markets[marketId].active = active;
        emit MarketSetActive(marketId, active);
    }

    /// @notice Return the registered market data for a given marketId (reverts if unset).
    function getMarket(uint256 marketId) external view returns (Market memory) {
        if (marketId == 0 || marketId > marketCount) revert MarketNotRegistered(marketId);
        return markets[marketId];
    }

    // ============ IGateway ============

    function processLendingInstruction(
        ProtocolTypes.Output[] calldata inputs,
        bytes calldata data
    ) external onlyRouter returns (ProtocolTypes.Output[] memory) {
        ProtocolTypes.LendingInstruction memory ins = abi.decode(data, (ProtocolTypes.LendingInstruction));
        Ctx memory c = _decodeContext(ins.context);

        // Resolve amount/token from input UTXO if referenced
        uint256 amount = ins.amount;
        address token = ins.token;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        return _dispatch(ins.op, c, token, amount, ins.user);
    }

    function _dispatch(
        ProtocolTypes.LendingOp op,
        Ctx memory c,
        address token,
        uint256 amount,
        address user
    ) internal returns (ProtocolTypes.Output[] memory) {
        if (op == ProtocolTypes.LendingOp.Deposit || op == ProtocolTypes.LendingOp.DepositCollateral) {
            _depositCollateral(c, token, amount, user);
            return _noOutput();
        }
        if (op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            if (c.tokenId == 0) revert TokenIdRequired();
            return _output(token, _withdrawCollateral(c, token, amount, user));
        }
        if (op == ProtocolTypes.LendingOp.Borrow) {
            if (c.tokenId == 0) revert TokenIdRequired();
            if (token != c.debtToken) revert TokenMismatch();
            return _output(c.debtToken, _borrow(c, amount));
        }
        if (op == ProtocolTypes.LendingOp.Repay) {
            if (c.tokenId == 0) revert TokenIdRequired();
            return _output(token, _repay(c, token, amount));
        }
        if (op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            if (c.tokenId == 0) revert TokenIdRequired();
            return _output(c.debtToken, _getBorrowBalance(c));
        }
        if (op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            if (c.tokenId == 0) revert TokenIdRequired();
            return _output(token, _getSupplyBalance(c, token));
        }
        revert UnsupportedOperation();
    }

    // ============ Internal: write ============

    function _depositCollateral(
        Ctx memory c,
        address token,
        uint256 amount,
        address user
    ) internal nonReentrant {
        // Pull `amount` of `token` from router
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        uint256 mytShares;
        if (token == c.underlying) {
            // Wrap underlying -> MYT shares via ERC4626
            IERC20(c.underlying).forceApprove(c.myt, amount);
            mytShares = IERC4626(c.myt).deposit(amount, address(this));
        } else if (token == c.myt) {
            mytShares = amount;
        } else {
            revert TokenMismatch();
        }

        IERC20(c.myt).forceApprove(c.alchemist, mytShares);
        // Pass tokenId == 0 to mint a fresh position; otherwise top up existing
        IAlchemistV3(c.alchemist).deposit(mytShares, user, c.tokenId);
    }

    function _withdrawCollateral(
        Ctx memory c,
        address token,
        uint256 requestedAmount,
        address user
    ) internal nonReentrant returns (uint256) {
        // AlchemistV3.withdraw enforces msg.sender == ownerOf(tokenId) with no approval bypass,
        // so we transfer the NFT into this gateway, withdraw, then return it.
        // The user must have setApprovalForAll(gateway, true) on the position NFT — see authorize().
        IERC721(c.positionNFT).transferFrom(user, address(this), c.tokenId);

        // Read the CDP once up-front so we can both clamp and detect full-withdraw round-trip dust.
        (uint256 collateral, , ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);

        uint256 mytShares;
        if (token == c.underlying) {
            // Full-withdraw guard: when the chained `GetSupplyBalance → WithdrawCollateral`
            // flow asks for the entire underlying balance, naively converting back through
            // `convertUnderlyingTokensToYield` rounds down and leaves a few wei of MYT dust
            // in the position. Detect "this is the full balance" and use the raw collateral
            // directly to avoid the round-trip.
            uint256 maxUnderlying = IAlchemistV3(c.alchemist).convertYieldTokensToUnderlying(collateral);
            if (requestedAmount >= maxUnderlying) {
                mytShares = collateral;
            } else {
                // Partial-withdraw round-trip dust guard: alchemist.convertUnderlyingTokensToYield
                // rounds DOWN, and the subsequent IERC4626.redeem on the MYT vault also rounds DOWN,
                // so the gateway returns up to a few wei *less* underlying than requested. That broke
                // the close-with-collateral conditional-order topology — flash-loan repayment expects
                // the full requestedAmount back from the post-hook withdraw and any shortfall makes
                // the lender's transferFrom revert.
                //
                // ERC4626.previewWithdraw is spec-bound to round shares UP (it answers "how many
                // shares must I burn to RECEIVE `assets`"), so combined with redeem(previewWithdraw(U))
                // we are guaranteed >= U back — modulo collateral availability.
                mytShares = IERC4626(c.myt).previewWithdraw(requestedAmount);
                if (mytShares > collateral) mytShares = collateral;
            }
        } else if (token == c.myt) {
            mytShares = requestedAmount;
        } else {
            // Return NFT before reverting so user state is restored
            IERC721(c.positionNFT).transferFrom(address(this), user, c.tokenId);
            revert TokenMismatch();
        }

        // Final clamp for `type(uint256).max` patterns and any residual rounding noise.
        // The alchemist itself enforces `collateral − lockedCollateral ≥ amount`; we don't
        // pre-clamp by lockedCollateral here so over-asks revert with a clear IllegalArgument
        // signal instead of being silently truncated.
        if (mytShares > collateral) mytShares = collateral;

        // Withdraw to the gateway
        uint256 mytReceived = IAlchemistV3(c.alchemist).withdraw(mytShares, address(this), c.tokenId);

        // Return NFT to user
        IERC721(c.positionNFT).transferFrom(address(this), user, c.tokenId);

        // Forward to router as either underlying or MYT
        if (token == c.underlying) {
            uint256 out = IERC4626(c.myt).redeem(mytReceived, msg.sender, address(this));
            return out;
        } else {
            IERC20(c.myt).safeTransfer(msg.sender, mytReceived);
            return mytReceived;
        }
    }

    function _borrow(Ctx memory c, uint256 amount) internal nonReentrant returns (uint256) {
        // mintFrom requires the user to have called approveMint(tokenId, gateway, amount).
        // alAsset is minted directly to this gateway, then forwarded to the router.
        IAlchemistV3(c.alchemist).mintFrom(c.tokenId, amount, address(this));
        IERC20(c.debtToken).safeTransfer(msg.sender, amount);
        return amount;
    }

    function _repay(
        Ctx memory c,
        address token,
        uint256 amount
    ) internal nonReentrant returns (uint256 refund) {
        if (token == c.debtToken) {
            // Burn alAsset to repay UNEARMARKED debt only.
            // Note: AlchemistV3 reverts with CannotRepayOnMintBlock if a mint occurred this block
            // for this position — composing Borrow + Repay on the same tokenId in one tx is unsupported.
            IERC20 alAsset = IERC20(c.debtToken);
            uint256 pre = alAsset.balanceOf(address(this));
            alAsset.safeTransferFrom(msg.sender, address(this), amount);

            (, uint256 debt, uint256 earmarked) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
            uint256 unearmarked = debt > earmarked ? debt - earmarked : 0;
            uint256 toBurn = amount > unearmarked ? unearmarked : amount;

            if (toBurn > 0) {
                alAsset.forceApprove(c.alchemist, toBurn);
                IAlchemistV3(c.alchemist).burn(toBurn, c.tokenId);
            }

            uint256 post = alAsset.balanceOf(address(this));
            refund = post > pre ? post - pre : 0;
            if (refund > 0) {
                alAsset.safeTransfer(msg.sender, refund);
            }
        } else if (token == c.underlying || token == c.myt) {
            // Use AlchemistV3.repay() — pays both earmarked and unearmarked debt with MYT shares.
            IERC20 inToken = IERC20(token);
            uint256 pre = inToken.balanceOf(address(this));
            inToken.safeTransferFrom(msg.sender, address(this), amount);

            uint256 mytShares;
            if (token == c.underlying) {
                IERC20(c.underlying).forceApprove(c.myt, amount);
                mytShares = IERC4626(c.myt).deposit(amount, address(this));
            } else {
                mytShares = amount;
            }

            // Cap to current debt converted to MYT to avoid spending more than needed
            (, uint256 debt, ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
            uint256 maxMyt = IAlchemistV3(c.alchemist).convertDebtTokensToYield(debt);
            uint256 toRepay = mytShares > maxMyt ? maxMyt : mytShares;

            if (toRepay > 0) {
                IERC20(c.myt).forceApprove(c.alchemist, toRepay);
                IAlchemistV3(c.alchemist).repay(toRepay, c.tokenId);
            }

            // Refund any leftover in the same `token` units the user sent in
            uint256 leftoverMyt = mytShares - toRepay;
            if (leftoverMyt > 0) {
                if (token == c.underlying) {
                    // Redeem leftover shares back to underlying for the refund
                    IERC4626(c.myt).redeem(leftoverMyt, msg.sender, address(this));
                } else {
                    IERC20(c.myt).safeTransfer(msg.sender, leftoverMyt);
                }
            }

            uint256 post = inToken.balanceOf(address(this));
            refund = post > pre ? post - pre : 0;
            if (refund > 0) {
                inToken.safeTransfer(msg.sender, refund);
            }
        } else {
            revert TokenMismatch();
        }
    }

    // ============ Internal: views ============

    function _getBorrowBalance(Ctx memory c) internal view returns (uint256) {
        (, uint256 debt, ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
        return debt;
    }

    /// @return amount Supply balance in `token` units. If `token == underlying`, the MYT
    ///                collateral is converted to underlying via the alchemist's adapter.
    function _getSupplyBalance(Ctx memory c, address token) internal view returns (uint256) {
        (uint256 collateral, , ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
        if (token == c.underlying) {
            return IAlchemistV3(c.alchemist).convertYieldTokensToUnderlying(collateral);
        }
        if (token == c.myt) {
            return collateral;
        }
        revert TokenMismatch();
    }

    // ============ IGateway: authorize / deauthorize ============

    function authorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata inputs
    ) external view returns (address[] memory targets, bytes[] memory data, ProtocolTypes.Output[] memory produced) {
        // Each instruction emits at most 2 auth calls (NFT operator + mint allowance), so size
        // the arrays generously and compact at the end.
        uint256 maxCalls = instrs.length * 2;
        targets = new address[](maxCalls);
        data = new bytes[](maxCalls);

        uint256 outCount = _countOutputs(instrs);
        produced = new ProtocolTypes.Output[](outCount);

        AuthState memory s;

        for (uint256 i = 0; i < instrs.length; i++) {
            _processAuthInstruction(instrs[i], caller, inputs, targets, data, produced, s);
        }

        // Compact targets/data to the actually-used length
        assembly {
            mstore(targets, mload(s)) // s.targetIdx is at offset 0
            mstore(data, mload(s))
        }
    }

    function deauthorize(
        ProtocolTypes.LendingInstruction[] calldata instrs,
        address caller,
        ProtocolTypes.Output[] calldata /*inputs*/
    ) external view override returns (address[] memory targets, bytes[] memory data) {
        // Track unique (positionNFT, alchemist+tokenId) pairs that need teardown.
        // We revoke setApprovalForAll on each unique NFT and resetMintAllowance is left to the
        // alchemist's own NFT-transfer hooks (the mint allowance is per-position-version).
        // For simplicity we emit a single setApprovalForAll(false) per unique positionNFT seen.
        address[] memory nftSeen = new address[](instrs.length);
        uint256 nftCount = 0;

        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (op != ProtocolTypes.LendingOp.WithdrawCollateral) continue;
            Ctx memory c = _decodeContext(instrs[i].context);

            bool seen = false;
            for (uint256 j = 0; j < nftCount; j++) {
                if (nftSeen[j] == c.positionNFT) {
                    seen = true;
                    break;
                }
            }
            if (!seen) {
                nftSeen[nftCount++] = c.positionNFT;
            }
        }

        // For Borrow ops, revoke mint allowance back to 0 per (alchemist, tokenId).
        // We collect those separately.
        address[] memory mintAlchemists = new address[](instrs.length);
        uint256[] memory mintTokenIds = new uint256[](instrs.length);
        uint256 mintCount = 0;
        for (uint256 i = 0; i < instrs.length; i++) {
            if (instrs[i].op != ProtocolTypes.LendingOp.Borrow) continue;
            Ctx memory c = _decodeContext(instrs[i].context);

            bool seen = false;
            for (uint256 j = 0; j < mintCount; j++) {
                if (mintAlchemists[j] == c.alchemist && mintTokenIds[j] == c.tokenId) {
                    seen = true;
                    break;
                }
            }
            if (!seen) {
                mintAlchemists[mintCount] = c.alchemist;
                mintTokenIds[mintCount] = c.tokenId;
                mintCount++;
            }
        }

        uint256 total = nftCount + mintCount;
        targets = new address[](total);
        data = new bytes[](total);
        uint256 idx;
        for (uint256 i = 0; i < nftCount; i++) {
            targets[idx] = nftSeen[i];
            data[idx] = abi.encodeWithSelector(IERC721.setApprovalForAll.selector, address(this), false);
            idx++;
        }
        for (uint256 i = 0; i < mintCount; i++) {
            targets[idx] = mintAlchemists[i];
            data[idx] = abi.encodeWithSelector(IAlchemistV3.approveMint.selector, mintTokenIds[i], address(this), 0);
            idx++;
        }
        // Silence unused warning — caller is informational only here.
        caller;
    }

    // ============ Authorization helpers ============

    /// @dev Helper struct to keep stack low and let assembly compact the output arrays.
    struct AuthState {
        uint256 targetIdx;
        uint256 pIdx;
    }

    function _countOutputs(ProtocolTypes.LendingInstruction[] calldata instrs) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < instrs.length; i++) {
            ProtocolTypes.LendingOp op = instrs[i].op;
            if (
                op == ProtocolTypes.LendingOp.WithdrawCollateral ||
                op == ProtocolTypes.LendingOp.Borrow ||
                op == ProtocolTypes.LendingOp.Repay ||
                op == ProtocolTypes.LendingOp.GetBorrowBalance ||
                op == ProtocolTypes.LendingOp.GetSupplyBalance
            ) {
                count++;
            }
        }
    }

    function _processAuthInstruction(
        ProtocolTypes.LendingInstruction calldata ins,
        address caller,
        ProtocolTypes.Output[] calldata inputs,
        address[] memory targets,
        bytes[] memory data,
        ProtocolTypes.Output[] memory produced,
        AuthState memory s
    ) internal view {
        Ctx memory c = _decodeContext(ins.context);

        address token = ins.token;
        uint256 amount = ins.amount;
        if (ins.input.index < inputs.length) {
            token = inputs[ins.input.index].token;
            amount = inputs[ins.input.index].amount;
        }

        if (ins.op == ProtocolTypes.LendingOp.WithdrawCollateral) {
            // Need NFT operator approval so the gateway can move the position NFT during withdraw.
            if (!IERC721(c.positionNFT).isApprovedForAll(caller, address(this))) {
                targets[s.targetIdx] = c.positionNFT;
                data[s.targetIdx] = abi.encodeWithSelector(IERC721.setApprovalForAll.selector, address(this), true);
                s.targetIdx++;
            }
            produced[s.pIdx++] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (ins.op == ProtocolTypes.LendingOp.Borrow) {
            // Need mint allowance on the position so the gateway can call mintFrom.
            uint256 cur = IAlchemistV3(c.alchemist).mintAllowance(c.tokenId, address(this));
            if (cur < amount) {
                targets[s.targetIdx] = c.alchemist;
                data[s.targetIdx] = abi.encodeWithSelector(
                    IAlchemistV3.approveMint.selector,
                    c.tokenId,
                    address(this),
                    type(uint256).max
                );
                s.targetIdx++;
            }
            produced[s.pIdx++] = ProtocolTypes.Output({ token: token, amount: amount });
        } else if (ins.op == ProtocolTypes.LendingOp.GetBorrowBalance) {
            (, uint256 debt, ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
            // 0.1% buffer for sync/earmark drift between authorize() simulation and execution
            debt = (debt * 1001) / 1000;
            produced[s.pIdx++] = ProtocolTypes.Output({ token: c.debtToken, amount: debt });
        } else if (ins.op == ProtocolTypes.LendingOp.GetSupplyBalance) {
            (uint256 collateral, , ) = IAlchemistV3(c.alchemist).getCDP(c.tokenId);
            uint256 reported;
            if (token == c.underlying) {
                reported = IAlchemistV3(c.alchemist).convertYieldTokensToUnderlying(collateral);
            } else {
                reported = collateral;
            }
            reported = (reported * 1001) / 1000;
            produced[s.pIdx++] = ProtocolTypes.Output({ token: token, amount: reported });
        } else if (ins.op == ProtocolTypes.LendingOp.Repay) {
            produced[s.pIdx++] = ProtocolTypes.Output({ token: token, amount: 0 });
        }
        // Deposit / DepositCollateral: no on-NFT auth needed (deposit is permissionless).
        // ERC20 approval on `token` (underlying or MYT) is handled by the router's normal flow.
    }

    // ============ Context decoding ============

    struct Ctx {
        address alchemist;
        address myt;
        address underlying;
        address debtToken;
        address positionNFT;
        uint256 tokenId;
    }

    function _decodeContext(bytes memory ctx) internal view returns (Ctx memory c) {
        // Context is just (marketId, tokenId) — every dependent address is sourced from
        // the on-chain registry populated by `registerMarket`, so callers cannot spoof.
        if (ctx.length < 64) revert InvalidContext();
        (uint256 marketId, uint256 tokenId) = abi.decode(ctx, (uint256, uint256));

        if (marketId == 0 || marketId > marketCount) revert MarketNotRegistered(marketId);
        Market storage m = markets[marketId];
        if (!m.active) revert MarketNotRegistered(marketId);

        c.alchemist = m.alchemist;
        c.myt = m.myt;
        c.underlying = m.underlying;
        c.debtToken = m.debtToken;
        c.positionNFT = m.positionNft;
        c.tokenId = tokenId;
    }

    // ============ Output helpers ============

    function _noOutput() internal pure returns (ProtocolTypes.Output[] memory) {
        return new ProtocolTypes.Output[](0);
    }

    function _output(address token, uint256 amount) internal pure returns (ProtocolTypes.Output[] memory outputs) {
        outputs = new ProtocolTypes.Output[](1);
        outputs[0] = ProtocolTypes.Output({ token: token, amount: amount });
    }

    // ============ Emergency Recovery ============

    /// @notice Recover stuck tokens (owner only)
    function recoverTokens(address token, address to, uint256 amount) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 toRecover = amount == type(uint256).max ? balance : amount;
        if (toRecover > balance) toRecover = balance;
        if (toRecover > 0) {
            IERC20(token).safeTransfer(to, toRecover);
        }
    }

    /// @notice Recover stuck ERC721 (owner only) — needed only if a position NFT is left here
    ///         after a partial revert mid-withdraw.
    function recoverNFT(address nft, address to, uint256 tokenId) external onlyOwner {
        IERC721(nft).transferFrom(address(this), to, tokenId);
    }
}
