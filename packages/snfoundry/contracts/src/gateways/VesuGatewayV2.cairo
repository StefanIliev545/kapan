use core::array::{Array, Span};
use openzeppelin::token::erc20::interface::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher, IERC20MetadataDispatcherTrait,
};
use starknet::ContractAddress;
use crate::interfaces::vesu_v2::{
    AssetPrice, IPoolDispatcher, IPoolDispatcherTrait,
    IERC4626Dispatcher, IERC4626DispatcherTrait,
    Amount, AmountDenomination, Context, ModifyPositionParams, UpdatePositionResponse,
    IOracleDispatcher, IOracleDispatcherTrait,
};
use crate::interfaces::IGateway::{
    Borrow, Deposit, ILendingInstructionProcessor, InstructionOutput, LendingInstruction, Repay, Withdraw,
};
use core::traits::Into;
use core::integer::u256;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
}

#[starknet::interface]
pub trait IVesuGatewayAdmin<TContractState> {
    fn add_asset(ref self: TContractState, asset: ContractAddress);
    fn add_pool(ref self: TContractState, pool_address: ContractAddress);
    fn add_pool_asset(ref self: TContractState, pool_address: ContractAddress, asset: ContractAddress);
}

#[derive(Drop, Serde)]
pub struct TokenMetadata {
    pub address: ContractAddress,
    pub symbol: felt252,
    pub decimals: u8,
    pub rate_accumulator: u256,
    pub utilization: u256,
    pub fee_rate: u256,
    pub price: AssetPrice,
    pub total_nominal_debt: u256,
    pub last_rate_accumulator: u256,
    pub reserve: u256,
    pub scale: u256,
}

#[derive(Drop, Serde, Copy)]
pub struct PositionWithAmounts {
    pub collateral_shares: u256,
    pub collateral_amount: u256,
    pub nominal_debt: u256,
    pub is_vtoken: bool,
}

#[starknet::interface]
pub trait IVesuViewer<TContractState> {
    fn get_all_positions(
        self: @TContractState, user: ContractAddress, pool_address: ContractAddress
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;
    fn get_supported_assets_array(self: @TContractState) -> Array<ContractAddress>;
    fn get_supported_assets_info(
        self: @TContractState, user: ContractAddress, pool_address: ContractAddress
    ) -> Array<(ContractAddress, felt252, u8, u256)>;
    fn get_supported_assets_ui(self: @TContractState, pool_address: ContractAddress) -> Array<TokenMetadata>;
    fn get_asset_price(self: @TContractState, asset: ContractAddress, pool_address: ContractAddress) -> u256;

    // Pagination to avoid RPC step limits
    fn get_all_positions_range(
        self: @TContractState,
        user: ContractAddress,
        pool_address: ContractAddress,
        start_index: usize,
        end_index: usize,
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;

    // Handy for UIs to ask “what’s my (collateral, debt) pair given a V2 context?”
    fn get_position_from_context(
        self: @TContractState,
        user: ContractAddress,
        ctx: VesuContext,
        other_token: ContractAddress,
        is_debt_context: bool,
    ) -> (ContractAddress, ContractAddress, PositionWithAmounts);
}

#[derive(Drop, Serde)]
pub struct VesuContext {
    // V2: target a specific pool contract; debt is isolated by (collateral, debt) pair
    pub pool_address: ContractAddress,
    pub position_counterpart_token: ContractAddress, // collateral if the instruction’s token is debt, or debt if the instruction’s token is collateral
}

#[starknet::interface]
trait IERC20Symbol<TContractState> {
    fn symbol(self: @TContractState) -> felt252;
}

#[derive(Copy, Drop)]
struct InstructionPair {
    first: usize,
    second: usize,
    paired: bool,
}

#[starknet::contract]
mod VesuGatewayV2 {
    use super::*;
    use alexandria_math::i257::{I257Impl, i257};
    use core::array::ArrayTrait;
    use core::num::traits::Zero;
    use core::option::{OptionTrait, Option};
    use openzeppelin::access::ownable::OwnableComponent;
    use starknet::storage::{
        Map, MutableVecTrait, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess, Vec, VecTrait,
    };
    use starknet::{get_caller_address, get_contract_address};

    component!(path: OwnableComponent, storage: ownable, event: OwnableEvent);

    #[abi(embed_v0)]
    impl OwnableMixinImpl = OwnableComponent::OwnableMixinImpl<ContractState>;
    impl InternalImpl = OwnableComponent::InternalImpl<ContractState>;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        OwnableEvent: OwnableComponent::Event,
    }

    #[storage]
    struct Storage {
        // V2: store a default pool address (UI/backcompat)
        default_pool: ContractAddress,
        supported_assets: Vec<ContractAddress>,
        supported_pools: Vec<ContractAddress>,
        supported_pool_assets: Map<ContractAddress, Vec<ContractAddress>>,
        router: ContractAddress,
        oracle: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        default_pool: ContractAddress,
        router: ContractAddress,
        owner: ContractAddress,
        oracle: ContractAddress,
        supported_assets: Array<ContractAddress>,
    ) {
        self.default_pool.write(default_pool);
        self.router.write(router);
        self.oracle.write(oracle);
        self.ownable.initializer(owner);
        for asset in supported_assets {
            self.supported_assets.push(asset);
        }
    }

    // ------------------------------
    // Internal helpers (combined flow)
    // ------------------------------
    #[generate_trait]
    impl VesuGatewayInternal of IVesuGatewayInternal {
        // --- Pairing support (order‑agnostic) ---

        fn extract_pair_key(
            self: @ContractState,
            instr: @LendingInstruction,
        ) -> (ContractAddress, ContractAddress, ContractAddress, ContractAddress, bool) {
            match instr {
                LendingInstruction::Deposit(params) => {
                    let basic = *params.basic;
                    let mut pool = self.default_pool.read();
                    let mut debt: ContractAddress = Zero::zero();
                    if params.context.is_some() {
                        let mut ctx_bytes: Span<felt252> = (*params.context).unwrap();
                        let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                        if vctx.pool_address != Zero::zero() { pool = vctx.pool_address; }
                        if vctx.position_counterpart_token != Zero::zero() { debt = vctx.position_counterpart_token; }
                    }
                    (pool, basic.token, debt, basic.user, true)
                },
                LendingInstruction::Withdraw(params) => {
                    let basic = *params.basic;
                    let mut pool = self.default_pool.read();
                    let mut debt: ContractAddress = Zero::zero();
                    if params.context.is_some() {
                        let mut ctx_bytes: Span<felt252> = (*params.context).unwrap();
                        let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                        if vctx.pool_address != Zero::zero() { pool = vctx.pool_address; }
                        if vctx.position_counterpart_token != Zero::zero() { debt = vctx.position_counterpart_token; }
                    }
                    (pool, basic.token, debt, basic.user, true)
                },
                LendingInstruction::Borrow(params) => {
                    let basic = *params.basic;
                    let ctx = *params.context;
                    let mut ctx_bytes = ctx.unwrap();
                    let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                    let mut pool = self.default_pool.read();
                    if vctx.pool_address != Zero::zero() { pool = vctx.pool_address; }
                    (pool, vctx.position_counterpart_token, basic.token, basic.user, false)
                },
                LendingInstruction::Repay(params) => {
                    let basic = *params.basic;
                    let ctx = *params.context;
                    let mut ctx_bytes = ctx.unwrap();
                    let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                    let mut pool = self.default_pool.read();
                    if vctx.pool_address != Zero::zero() { pool = vctx.pool_address; }
                    (pool, vctx.position_counterpart_token, basic.token, basic.user, false)
                },
                _ => { (Zero::zero(), Zero::zero(), Zero::zero(), Zero::zero(), false) },
            }
        }

        fn pair_instructions(
            self: @ContractState,
            instrs: Span<LendingInstruction>,
        ) -> Array<InstructionPair> {
            let mut pairs: Array<InstructionPair> = array![];
            let mut pending_index_opt: Option<usize> = Option::None(());
            let mut pending_pool: ContractAddress = Zero::zero();
            let mut pending_collateral: ContractAddress = Zero::zero();
            let mut pending_debt: ContractAddress = Zero::zero();
            let mut pending_user: ContractAddress = Zero::zero();

            let len = instrs.len();
            let mut i: usize = 0;
            while i != len {
                let curr = instrs.at(i);
                let (p, c, d, u, _) = self.extract_pair_key(curr);

                match pending_index_opt {
                    Option::Some(pending_index) => {
                        let debts_match = pending_debt == Zero::zero() || d == Zero::zero() || pending_debt == d;
                        if p == pending_pool && c == pending_collateral && u == pending_user && debts_match {
                            pairs.append(InstructionPair { first: pending_index, second: i, paired: true });
                            pending_index_opt = Option::None(());
                        } else {
                            pairs.append(InstructionPair { first: pending_index, second: 0, paired: false });
                            pending_index_opt = Option::Some(i);
                            pending_pool = p;
                            pending_collateral = c;
                            pending_debt = d;
                            pending_user = u;
                        }
                    },
                    Option::None(()) => {
                        pending_index_opt = Option::Some(i);
                        pending_pool = p;
                        pending_collateral = c;
                        pending_debt = d;
                        pending_user = u;
                    },
                }
                i += 1;
            };

            if let Option::Some(pending_index) = pending_index_opt {
                pairs.append(InstructionPair { first: pending_index, second: 0, paired: false });
            }

            pairs
        }

        // --- Pool helpers ---

        fn get_vtoken_for_collateral(
            self: @ContractState, collateral: ContractAddress, _pool_address: ContractAddress,
        ) -> ContractAddress {
            // TODO: wire actual mapping in V2 if/when available
            collateral
        }

        // --- Builders (stage params like V1; execute later in merge step) ---

        fn deposit(ref self: ContractState, instruction: @Deposit) -> (ContractAddress, ModifyPositionParams) {
            let basic = *instruction.basic;
            let mut pool_address = self.default_pool.read();
            let mut debt_asset = Zero::zero();

            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vctx: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }
                if vctx.position_counterpart_token != Zero::zero() { debt_asset = vctx.position_counterpart_token; }
            }

            // Pull user tokens into gateway and approve pool
            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), Errors::TRANSFER_FAILED);
            assert(erc20.approve(pool_address, basic.amount), Errors::APPROVE_FAILED);

            let collateral_amount = I257Impl::new(basic.amount, false);
            let params = self.build_modify_params_collateral(
                pool_address, basic.token, debt_asset, basic.user, collateral_amount
            );
            (pool_address, params)
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) -> (ContractAddress, ModifyPositionParams) {
            let basic = *instruction.basic;
            let mut pool_address = self.default_pool.read();
            let mut debt_asset = Zero::zero();
            let user = basic.user;

            self.assert_router_or_user(user);

            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vctx: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }
                if vctx.position_counterpart_token != Zero::zero() { debt_asset = vctx.position_counterpart_token; }
            }

            let collateral_amount = I257Impl::new(basic.amount, true);
            let params = self.build_modify_params_collateral(
                pool_address, basic.token, debt_asset, user, collateral_amount
            );
            (pool_address, params)
        }

        fn borrow(ref self: ContractState, instruction: @Borrow) -> (ContractAddress, ModifyPositionParams) {
            let basic = *instruction.basic;
            self.assert_router_or_user(basic.user);
            let ctx = *instruction.context;
            assert(ctx.is_some(), 'Context is required for borrow');

            let mut ctx_bytes = ctx.unwrap();
            let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();

            let mut pool_address = self.default_pool.read();
            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }

            let debt_amount = I257Impl::new(basic.amount, false);
            let params = self.build_modify_params_debt(
                pool_address, vctx.position_counterpart_token, basic.token, basic.user, debt_amount
            );
            (pool_address, params)
        }

        fn repay(ref self: ContractState, instruction: @Repay) -> (ContractAddress, ModifyPositionParams) {
            let basic = *instruction.basic;
            let ctx = *instruction.context;
            assert(ctx.is_some(), 'Context is required for repay');

            let mut ctx_bytes = ctx.unwrap();
            let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();

            let mut pool_address = self.default_pool.read();
            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }

            // Compute current debt (minimize approvals)
            let current_debt = self.get_debt_for_user_position(*instruction);
            let to_repay = if basic.amount > current_debt { current_debt } else { basic.amount };

            // Pull tokens and approve pool
            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            assert(erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount), Errors::TRANSFER_FAILED);
            if to_repay > 0 {
                assert(erc20.approve(pool_address, to_repay), Errors::APPROVE_FAILED);
            }

            let debt_amount = I257Impl::new(to_repay, true);
            let params = self.build_modify_params_debt(
                pool_address, vctx.position_counterpart_token, basic.token, basic.user, debt_amount
            );
            (pool_address, params)
        }

        fn build_modify_params_collateral(
            ref self: ContractState,
            pool_address: ContractAddress,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257,
        ) -> ModifyPositionParams {
            let pool = IPoolDispatcher { contract_address: pool_address };
            let ctx: Context = pool.context(debt_asset, collateral_asset, user);

            // Bound negative withdrawals to available
            let mut final_amount = collateral_amount;
            if collateral_amount.is_negative() {
                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
                let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = ctx.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');

                if requested_shares >= available_shares {
                    // withdraw all: convert full shares to assets and use that negative
                    let max_assets = erc4626.convert_to_assets(available_shares);
                    final_amount = I257Impl::new(max_assets, true);
                } else {
                    let max_assets = erc4626.convert_to_assets(requested_shares);
                    final_amount = I257Impl::new(max_assets, true);
                }
            }

            ModifyPositionParams {
                collateral_asset,
                debt_asset,
                user,
                collateral: Amount { denomination: AmountDenomination::Assets, value: final_amount },
                debt: Default::default(),
            }
        }

        fn build_modify_params_debt(
            ref self: ContractState,
            _pool_address: ContractAddress,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257,
        ) -> ModifyPositionParams {
            ModifyPositionParams {
                collateral_asset,
                debt_asset,
                user,
                collateral: Default::default(),
                debt: Amount { denomination: AmountDenomination::Assets, value: debt_amount },
            }
        }

        fn is_amount_effective(self: @ContractState, amount: Amount) -> bool {
            let zero_i = I257Impl::new(0, false);
            amount.value != zero_i
        }

        fn build_group_indices(self: @ContractState, pair: InstructionPair) -> Array<usize> {
            let mut group: Array<usize> = array![];
            group.append(pair.first);
            if pair.paired { group.append(pair.second); }
            group
        }

        fn build_params_for_group(
            ref self: ContractState,
            instructions: Span<LendingInstruction>,
            group: Span<usize>,
        ) -> (Array<ContractAddress>, Array<ModifyPositionParams>) {
            let mut pools: Array<ContractAddress> = array![];
            let mut params_list: Array<ModifyPositionParams> = ArrayTrait::new();

            for gidx in group {
                let idx = *gidx;
                match instructions.at(idx) {
                    LendingInstruction::Deposit(dep) => {
                        let (pool, p) = self.deposit(dep);
                        pools.append(pool);
                        params_list.append(p);
                    },
                    LendingInstruction::Withdraw(wd) => {
                        let (pool, p) = self.withdraw(wd);
                        pools.append(pool);
                        params_list.append(p);
                    },
                    LendingInstruction::Borrow(bor) => {
                        let (pool, p) = self.borrow(bor);
                        pools.append(pool);
                        params_list.append(p);
                    },
                    LendingInstruction::Repay(rep) => {
                        let (pool, p) = self.repay(rep);
                        pools.append(pool);
                        params_list.append(p);
                    },
                    _ => {},
                }
            };
            (pools, params_list)
        }

        fn chosen_or_assert_same_pool(
            self: @ContractState,
            pools: Span<ContractAddress>,
        ) -> ContractAddress {
            let chosen = *pools.at(0);
            if pools.len() == 2 {
                let other = *pools.at(1);
                assert(chosen == other, 'mixed-pool-group');
            }
            chosen
        }

        // Performs pre‑migration if needed (borrow‑only case), then executes one modify
        fn merge_and_execute(
            ref self: ContractState,
            pools: Span<ContractAddress>,
            params_list: Span<ModifyPositionParams>,
        ) -> UpdatePositionResponse {
            let pool_address = self.chosen_or_assert_same_pool(pools);
            let pool = IPoolDispatcher { contract_address: pool_address };

            // Merge like V1: pick the effective amounts & the non‑zero debt asset
            let merged = if params_list.len() == 2 {
                let first = *params_list.at(0);
                let second = *params_list.at(1);

                let coll = if self.is_amount_effective(first.collateral) { first.collateral } else { second.collateral };
                let debt = if self.is_amount_effective(first.debt) { first.debt } else { second.debt };

                let user = if first.user != Zero::zero() { first.user } else { second.user };
                let collateral_asset = if first.collateral_asset != Zero::zero() { first.collateral_asset } else { second.collateral_asset };
                let chosen_debt_asset = if second.debt_asset != Zero::zero() { second.debt_asset } else { first.debt_asset };

                ModifyPositionParams {
                    collateral_asset,
                    debt_asset: chosen_debt_asset,
                    user,
                    collateral: coll,
                    debt: debt,
                }
            } else {
                *params_list.at(0)
            };

            // If we are borrowing (positive debt delta) and there are no shares on (collateral, debt),
            // but shares exist on (collateral, 0), migrate them by withdraw+deposit.
            let zero_i = I257Impl::new(0, false);
            let is_borrow_only = (merged.debt.value != zero_i) && (merged.collateral.value == zero_i);
            if is_borrow_only {
                let (pos_target, _, _) = pool.position(merged.collateral_asset, merged.debt_asset, merged.user);
                if pos_target.collateral_shares == 0 {
                    // see if user has shares in zero‑debt slot and migrate those
                    let (pos_zero, _, _) = pool.position(merged.collateral_asset, Zero::zero(), merged.user);
                    if pos_zero.collateral_shares > 0 {
                        let vtoken = self.get_vtoken_for_collateral(merged.collateral_asset, pool_address);
                        let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                        let assets = erc4626.convert_to_assets(pos_zero.collateral_shares);

                        // Withdraw from (collateral, 0)
                        let withdraw_params = ModifyPositionParams {
                            collateral_asset: merged.collateral_asset,
                            debt_asset: Zero::zero(),
                            user: merged.user,
                            collateral: Amount { denomination: AmountDenomination::Assets, value: I257Impl::new(assets, true) },
                            debt: Default::default(),
                        };
                        pool.modify_position(withdraw_params);

                        // Approve & deposit to (collateral, debt)
                        let erc20 = IERC20Dispatcher { contract_address: merged.collateral_asset };
                        assert(erc20.approve(pool_address, assets), Errors::APPROVE_FAILED);

                        let deposit_params = ModifyPositionParams {
                            collateral_asset: merged.collateral_asset,
                            debt_asset: merged.debt_asset,
                            user: merged.user,
                            collateral: Amount { denomination: AmountDenomination::Assets, value: I257Impl::new(assets, false) },
                            debt: Default::default(),
                        };
                        pool.modify_position(deposit_params);
                    }
                }
            }

            // Single execution for the group
            pool.modify_position(merged)
        }

        fn post_actions_for_group(
            ref self: ContractState,
            instructions: Span<LendingInstruction>,
            group: Span<usize>,
            response: UpdatePositionResponse,
        ) -> Array<Span<InstructionOutput>> {
            let mut outs_all: Array<Span<InstructionOutput>> = array![];
            let withdrawn = response.collateral_delta.abs();
            let debt_changed = response.debt_delta.abs();

            for gidx in group {
                let idx = *gidx;
                match instructions.at(idx) {
                    LendingInstruction::Deposit(dep) => {
                        let token = dep.basic.token;
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: *token, balance: 0 });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Withdraw(wd) => {
                        let token = wd.basic.token;
                        if withdrawn > 0 {
                            let erc20 = IERC20Dispatcher { contract_address: *token };
                            assert(erc20.transfer(get_caller_address(), withdrawn), Errors::TRANSFER_FAILED);
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: *token, balance: withdrawn });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Borrow(bor) => {
                        let token = bor.basic.token;
                        if debt_changed > 0 {
                            let erc20 = IERC20Dispatcher { contract_address: *token };
                            assert(erc20.transfer(get_caller_address(), debt_changed), Errors::TRANSFER_FAILED);
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: *token, balance: debt_changed });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Repay(rep) => {
                        let rep = *rep;
                        let token = rep.basic.token;
                        let requested = rep.basic.amount;
                        // repay reduces debt; response.debt_delta is negative -> abs() gives repaid
                        let repaid = debt_changed;
                        let refund = if requested > repaid { requested - repaid } else { 0 };
                        if refund > 0 {
                            let erc20 = IERC20Dispatcher { contract_address: token };
                            assert(erc20.transfer(get_caller_address(), refund), Errors::TRANSFER_FAILED);
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token: token, balance: repaid });
                        outs.append(InstructionOutput { token: token, balance: refund }); // explicit refund
                        outs_all.append(outs.span());
                    },
                    _ => {},
                }
            };

            outs_all
        }

        // --- Auth / views ---

        fn assert_router_or_user(self: @ContractState, user: ContractAddress) {
            let router = self.router.read();
            assert(router == get_caller_address() || user == get_caller_address(), 'unauthorized');
        }

        fn get_debt_for_user_position(self: @ContractState, repay: Repay) -> u256 {
            let context = repay.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut ctx_bytes: Span<felt252> = context.unwrap();
            let vctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();

            let mut pool_address = self.default_pool.read();
            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }

            let pool = IPoolDispatcher { contract_address: pool_address };
            // poke context for up-to-date accounting if pool is lazy
            let _ = pool.context(vctx.position_counterpart_token, repay.basic.token, repay.basic.user);

            let (_, _, debt) = pool.position(vctx.position_counterpart_token, repay.basic.token, repay.basic.user);
            debt
        }
    }

    // ------------------------------
    // Admin
    // ------------------------------
    #[abi(embed_v0)]
    impl IVesuGatewayAdminImpl of IVesuGatewayAdmin<ContractState> {
        fn add_asset(ref self: ContractState, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_assets.push(asset);
        }

        fn add_pool(ref self: ContractState, pool_address: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_pools.push(pool_address);
        }

        fn add_pool_asset(ref self: ContractState, pool_address: ContractAddress, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            let mut supported_pool_assets = self.supported_pool_assets.entry(pool_address);
            supported_pool_assets.push(asset);
        }
    }

    // ------------------------------
    // Processor (combined actions)
    // ------------------------------
    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(
            ref self: ContractState,
            instructions: Span<LendingInstruction>
        ) -> Span<Span<InstructionOutput>> {
            let mut results = array![];
            let pairs = self.pair_instructions(instructions);

            let mut i: usize = 0;
            let len = pairs.len();
            while i != len {
                let pair = *pairs.at(i);
                let group = self.build_group_indices(pair);
                let (pools, params_list) = self.build_params_for_group(instructions, group.span());
                let response = self.merge_and_execute(pools.span(), params_list.span());
                let outs_arr = self.post_actions_for_group(instructions, group.span(), response);
                for j in 0..outs_arr.len() { results.append(*outs_arr.at(j)); }
                i += 1;
            };
            results.span()
        }

        // Authorizations for wallets/routers to pre‑sign
        fn get_authorizations_for_instructions(
            ref self: ContractState,
            instructions: Span<LendingInstruction>,
            rawSelectors: bool
        ) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(deposit_params) => {
                        let token = *deposit_params.basic.token;
                        let amount = deposit_params.basic.amount;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data);
                        Serde::serialize(amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Repay(repay_params) => {
                        let token = *repay_params.basic.token;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data);
                        Serde::serialize(repay_params.basic.amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Borrow(borrow_params) => {
                        let mut pool_address = self.default_pool.read();
                        if borrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*borrow_params).context.unwrap();
                            let vctx: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }
                        }
                        let mut call_data: Array<felt252> = array![];
                        // (delegatee, allow)
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((pool_address, selector, call_data));
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        let mut pool_address = self.default_pool.read();
                        if withdraw_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*withdraw_params).context.unwrap();
                            let vctx: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((pool_address, selector, call_data));
                    },
                    LendingInstruction::Reborrow(reborrow_params) => {
                        let mut pool_address = self.default_pool.read();
                        if reborrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*reborrow_params).context.unwrap();
                            let vctx: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vctx.pool_address != Zero::zero() { pool_address = vctx.pool_address; }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((pool_address, selector, call_data));
                    },
                    _ => {}
                }
            };
            authorizations.span()
        }

        fn get_flash_loan_amount(ref self: ContractState, repay: Repay) -> u256 {
            let mut amount = repay.basic.amount;
            if repay.repay_all {
                amount = self.get_debt_for_user_position(repay);
            }
            amount
        }
    }

    // ------------------------------
    // Interest rate view (UI only; same as your V2)
    // ------------------------------
    use crate::interfaces::IGateway::InterestRateView;
    use alexandria_math::{pow};

    #[abi(embed_v0)]
    impl InterestRateViewImpl of InterestRateView<ContractState> {
        fn get_borrow_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_address = self.default_pool.read();
            let pool = IPoolDispatcher { contract_address: pool_address };
            let rate_accumulator = pool.rate_accumulator(token_address);
            let utilization = pool.utilization(token_address);
            let (asset_config, _) = pool.asset_config(token_address);

            // Placeholder V2 formula (replace with the pool's exact one if different)
            let base_rate = asset_config.last_full_utilization_rate;
            let scale: u256 = pow(10, 18);
            let utilization_factor = (utilization * base_rate) / scale;
            let borrow_rate = base_rate + utilization_factor;
            borrow_rate
        }

        fn get_supply_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_address = self.default_pool.read();
            let pool = IPoolDispatcher { contract_address: pool_address };
            let rate_accumulator = pool.rate_accumulator(token_address);
            let utilization = pool.utilization(token_address);
            let (asset_config, _) = pool.asset_config(token_address);

            let base_rate = asset_config.last_full_utilization_rate;
            let scale: u256 = pow(10, 18);
            let utilization_factor = (utilization * base_rate) / scale;
            let borrow_rate = base_rate + utilization_factor;

            // Supply APR ≈ borrow APR * utilization
            let supply_rate = if utilization > 0 { (borrow_rate * utilization) / scale } else { 0 };
            supply_rate
        }
    }

    // ------------------------------
    // Read‑only viewer (V2 shapes)
    // ------------------------------
    use core::dict::{Felt252Dict, Felt252DictTrait, Felt252DictEntryTrait};

    #[abi(embed_v0)]
    impl IVesuViewerImpl of IVesuViewer<ContractState> {
        fn get_supported_assets_array(self: @ContractState) -> Array<ContractAddress> {
            let mut assets = array![];
            let len = self.supported_assets.len();
            for i in 0..len { assets.append(self.supported_assets.at(i).read()); }
            assets
        }

        fn get_supported_assets_info(
            self: @ContractState, user: ContractAddress, pool_address: ContractAddress
        ) -> Array<(ContractAddress, felt252, u8, u256)> {
            let mut assets = array![];
            let supported_assets = self.get_supported_assets_array();
            let len = supported_assets.len();

            let positions = self.get_all_positions(user, pool_address);
            let mut positions_map: Felt252Dict<u32> = Default::default();

            for n in 0..positions.len() {
                let (coll, _, _) = positions.at(n);
                positions_map.insert((*coll).into(), n + 1);
            };

            for i in 0..len {
                let underlying = *supported_assets.at(i);
                let symbol = super::IERC20SymbolDispatcher { contract_address: underlying }.symbol();
                let decimals = IERC20MetadataDispatcher { contract_address: underlying }.decimals();
                let mut idx = positions_map.get(underlying.into());
                let mut collateral_amount = 0;
                if idx != 0 {
                    idx -= 1;
                    let (_, _, pwa) = positions.at(idx);
                    collateral_amount = *pwa.collateral_amount;
                }
                assets.append((underlying, symbol, decimals, collateral_amount));
            };
            assets
        }

        fn get_all_positions(
            self: @ContractState, user: ContractAddress, pool_address: ContractAddress
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            let assets = self.get_supported_assets_array();
            let len = assets.len();
            self.get_all_positions_range(user, pool_address, 0, len)
        }

        fn get_all_positions_range(
            self: @ContractState,
            user: ContractAddress,
            pool_address: ContractAddress,
            start_index: usize,
            end_index: usize,
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            let mut positions = array![];
            let supported_assets = self.get_supported_assets_array();
            let len = supported_assets.len();
            let pool_address = if pool_address == Zero::zero() { self.default_pool.read() } else { pool_address };
            let pool = IPoolDispatcher { contract_address: pool_address };

            let start = if start_index > len { len } else { start_index };
            let end = if end_index > len { len } else { end_index };

            let mut i = start;
            while i != end {
                let collateral_asset = *supported_assets.at(i);

                // vToken balance (if vToken==underlying here, this is effectively underlying balance)
                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
                let erc20 = IERC20Dispatcher { contract_address: vtoken };
                let vtoken_balance = erc20.balance_of(user);
                if vtoken_balance > 0 {
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(vtoken_balance);
                    positions.append((
                        collateral_asset,
                        Zero::zero(),
                        PositionWithAmounts {
                            collateral_shares: vtoken_balance,
                            collateral_amount,
                            nominal_debt: 0,
                            is_vtoken: true,
                        },
                    ));
                }

                // Zero‑debt position (earn)
                let (pos0, _, _) = pool.position(collateral_asset, Zero::zero(), user);
                if pos0.collateral_shares > 0 {
                    let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(pos0.collateral_shares);
                    positions.append((
                        collateral_asset,
                        Zero::zero(),
                        PositionWithAmounts {
                            collateral_shares: pos0.collateral_shares,
                            collateral_amount,
                            nominal_debt: pos0.nominal_debt,
                            is_vtoken: false,
                        },
                    ));
                }

                // Other debt pairs
                for j in 0..len {
                    if i == j { continue; }
                    let debt_asset = *supported_assets.at(j);
                    let (position, _, debt) = pool.position(collateral_asset, debt_asset, user);
                    if position.collateral_shares > 0 || position.nominal_debt > 0 {
                        let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
                        let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                        let collateral_amount = erc4626.convert_to_assets(position.collateral_shares);
                        positions.append((
                            collateral_asset,
                            debt_asset,
                            PositionWithAmounts {
                                collateral_shares: position.collateral_shares,
                                collateral_amount,
                                nominal_debt: debt,
                                is_vtoken: false,
                            },
                        ));
                    }
                }

                i += 1;
            };
            positions
        }

        fn get_position_from_context(
            self: @ContractState,
            user: ContractAddress,
            ctx: VesuContext,
            other_token: ContractAddress,
            is_debt_context: bool,
        ) -> (ContractAddress, ContractAddress, PositionWithAmounts) {
            let pool_address = if ctx.pool_address == Zero::zero() { self.default_pool.read() } else { ctx.pool_address };
            let collateral_asset = if is_debt_context { other_token } else { ctx.position_counterpart_token };
            let debt_asset = if is_debt_context { ctx.position_counterpart_token } else { other_token };
            let pool = IPoolDispatcher { contract_address: pool_address };
            let (position, _, debt) = pool.position(collateral_asset, debt_asset, user);
            let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
            let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
            let collateral_amount = erc4626.convert_to_assets(position.collateral_shares);
            (collateral_asset, debt_asset, PositionWithAmounts {
                collateral_shares: position.collateral_shares,
                collateral_amount,
                nominal_debt: debt,
                is_vtoken: false,
            })
        }

        fn get_asset_price(self: @ContractState, asset: ContractAddress, pool_address: ContractAddress) -> u256 {
            let oracle = IOracleDispatcher { contract_address: self.oracle.read() };
            let asset_price = oracle.price(asset);
            asset_price.value
        }

        fn get_supported_assets_ui(self: @ContractState, pool_address: ContractAddress) -> Array<TokenMetadata> {
            let mut assets = array![];
            let len = self.supported_assets.len();
            let pool_address = if pool_address == Zero::zero() { self.default_pool.read() } else { pool_address };
            let pool = IPoolDispatcher { contract_address: pool_address };

            for i in 0..len {
                let asset = self.supported_assets.at(i).read();

                let symbol_felt = super::IERC20SymbolDispatcher { contract_address: asset }.symbol();
                let decimals = IERC20MetadataDispatcher { contract_address: asset }.decimals();

                let rate_accumulator = pool.rate_accumulator(asset);
                let utilization = pool.utilization(asset);
                let (asset_config, _) = pool.asset_config(asset);
                let fee_rate = asset_config.fee_rate;

                let oracle = IOracleDispatcher { contract_address: self.oracle.read() };
                let price = oracle.price(asset);

                assets.append(TokenMetadata {
                    address: asset,
                    symbol: symbol_felt,
                    decimals,
                    rate_accumulator,
                    utilization,
                    fee_rate,
                    price,
                    total_nominal_debt: asset_config.total_nominal_debt,
                    last_rate_accumulator: asset_config.last_rate_accumulator,
                    reserve: asset_config.reserve,
                    scale: asset_config.scale,
                }.into());
            };
            assets
        }
    }
}
