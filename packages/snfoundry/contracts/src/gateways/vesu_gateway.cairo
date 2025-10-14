use core::array::{Array, Span};
use core::byte_array::ByteArrayTrait;
use openzeppelin::token::erc20::interface::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use starknet::ContractAddress;
use crate::interfaces::vesu_data::{AssetPrice, Position};
use core::num::traits::Pow;
use core::traits::Into;
use core::traits::TryInto;
use core::integer::u256;

pub mod Errors {
    pub const APPROVE_FAILED: felt252 = 'Approve failed';
    pub const TRANSFER_FAILED: felt252 = 'Transfer failed';
}

#[starknet::interface]
pub trait IVesuGatewayAdmin<TContractState> {
    fn add_pool(ref self: TContractState, pool: felt252);
    // New: explicit allowlists per pool (batch)
    fn add_pool_collaterals(ref self: TContractState, pool: felt252, assets: Array<ContractAddress>);
    fn add_pool_debts(ref self: TContractState, pool: felt252, assets: Array<ContractAddress>);
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
        self: @TContractState, user: ContractAddress, pool_id: felt252
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;
    fn get_supported_assets_array(self: @TContractState, pool_id: felt252) -> Array<ContractAddress>;
    fn get_supported_assets_info(self: @TContractState, user: ContractAddress, pool_id: felt252) -> Array<(ContractAddress, felt252, u8, u256)>;
    fn get_supported_assets_ui(self: @TContractState, pool_id: felt252) -> Array<TokenMetadata>;
    fn get_asset_price(self: @TContractState, asset: ContractAddress) -> u256;
    // New: paginated positions fetch to avoid RPC step limits
    fn get_all_positions_range(
        self: @TContractState,
        user: ContractAddress,
        pool_id: felt252,
        start_index: usize,
        end_index: usize,
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;
    fn get_position_from_context(
        self: @TContractState,
        user: ContractAddress,
        ctx: VesuContext,
        other_token: ContractAddress,
        is_debt_context: bool,
    ) -> (ContractAddress, ContractAddress, PositionWithAmounts);
    fn get_supported_collateral_assets(self: @TContractState, pool_id: felt252) -> Array<ContractAddress>;
    fn get_supported_debt_assets(self: @TContractState, pool_id: felt252) -> Array<ContractAddress>;
}

#[derive(Drop, Serde)]
pub struct VesuContext {
    // Vesu has pools and positions. Debt is isolated in pairs to a collateral.
    pub pool_id: felt252, // This allows targeting a specific pool besides genesis.
    pub position_counterpart_token: ContractAddress // This is either the collateral or the debt token depending on the instruction.
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
mod VesuGateway {
    use alexandria_math::i257::{I257Impl, i257};
    use core::array::ArrayTrait;
    use core::num::traits::Zero;
    use core::option::{OptionTrait, Option};
    use openzeppelin::access::ownable::OwnableComponent;
    use openzeppelin::token::erc20::interface::{
        IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
        IERC20MetadataDispatcherTrait,
    };
    use starknet::storage::{
        Map, MutableVecTrait, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
        Vec, VecTrait,
    };
    use starknet::{contract_address_const, get_caller_address, get_contract_address};
    use crate::interfaces::IGateway::{
        Borrow,
        Deposit,
        ILendingInstructionProcessor,
        LendingInstruction,
        Repay,
        Withdraw,
        InstructionOutput,
    };
    use crate::interfaces::vesu::{
        IDefaultExtensionCLDispatcher, IDefaultExtensionCLDispatcherTrait, IERC4626Dispatcher,
        IERC4626DispatcherTrait, ISingletonDispatcher, ISingletonDispatcherTrait,
    };
    use crate::interfaces::vesu_data::{
        Amount, AmountDenomination, AmountType, Context, ModifyPositionParams, Position,
        TransferPositionParams, UnsignedAmount, UpdatePositionResponse,
    };
    use super::*;


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
    // Add storage variables here
    vesu_singleton: ContractAddress,
    pool_id: felt252,
    supported_pools: Vec<felt252>,
    // Replaces prior single list with explicit allowlists
    supported_pool_collaterals: Map<felt252, Vec<ContractAddress>>,
    supported_pool_debts: Map<felt252, Vec<ContractAddress>>,
    router: ContractAddress,
    #[substorage(v0)]
    ownable: OwnableComponent::Storage,
}

    #[constructor]
    fn constructor(
        ref self: ContractState,
        vesu_singleton: ContractAddress,
        pool_id: felt252,
        router: ContractAddress,
        owner: ContractAddress,
    ) {
        self.vesu_singleton.write(vesu_singleton);
        self.pool_id.write(pool_id);
        self.router.write(router);
        self.ownable.initializer(owner);
    }

    #[generate_trait]
    impl VesuGatewayInternal of IVesuGatewayInternal {
        // Pairing support: represent a (possibly) paired instruction window
      

        // Identify instruction categories
        fn is_collateral_action(self: @ContractState, instr: @LendingInstruction) -> bool {
            match instr {
                LendingInstruction::Deposit(_) => true,
                LendingInstruction::Withdraw(_) => true,
                _ => false,
            }
        }

        fn is_debt_action(self: @ContractState, instr: @LendingInstruction) -> bool {
            match instr {
                LendingInstruction::Borrow(_) => true,
                LendingInstruction::Repay(_) => true,
                _ => false,
            }
        }

        // Extract normalized pair key (pool, collateral, debt, user) for matching
        fn extract_pair_key(
            self: @ContractState,
            instr: @LendingInstruction,
        ) -> (felt252, ContractAddress, ContractAddress, ContractAddress, bool) {
            match instr {
                LendingInstruction::Deposit(params) => {
                    let basic = *params.basic;
                    let mut pool = self.pool_id.read();
                    let mut debt: ContractAddress = Zero::zero();
                    if params.context.is_some() {
                        let mut ctx_bytes: Span<felt252> = (*params.context).unwrap();
                        let vesu_ctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                        if vesu_ctx.pool_id != Zero::zero() { pool = vesu_ctx.pool_id; }
                        if vesu_ctx.position_counterpart_token != Zero::zero() { debt = vesu_ctx.position_counterpart_token; }
                    }
                    (pool, basic.token, debt, basic.user, true)
                },
                LendingInstruction::Withdraw(params) => {
                    let basic = *params.basic;
                    let mut pool = self.pool_id.read();
                    let mut debt: ContractAddress = Zero::zero();
                    if params.context.is_some() {
                        let mut ctx_bytes: Span<felt252> = (*params.context).unwrap();
                        let vesu_ctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                        if vesu_ctx.pool_id != Zero::zero() { pool = vesu_ctx.pool_id; }
                        if vesu_ctx.position_counterpart_token != Zero::zero() { debt = vesu_ctx.position_counterpart_token; }
                    }
                    (pool, basic.token, debt, basic.user, true)
                },
                LendingInstruction::Borrow(params) => {
                    let basic = *params.basic;
                    let ctx = *params.context;
                    let mut ctx_bytes = ctx.unwrap();
                    let vesu_ctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                    let mut pool = self.pool_id.read();
                    if vesu_ctx.pool_id != Zero::zero() { pool = vesu_ctx.pool_id; }
                    (pool, vesu_ctx.position_counterpart_token, basic.token, basic.user, false)
                },
                LendingInstruction::Repay(params) => {
                    let basic = *params.basic;
                    let ctx = *params.context;
                    let mut ctx_bytes = ctx.unwrap();
                    let vesu_ctx: VesuContext = Serde::deserialize(ref ctx_bytes).unwrap();
                    let mut pool = self.pool_id.read();
                    if vesu_ctx.pool_id != Zero::zero() { pool = vesu_ctx.pool_id; }
                    (pool, vesu_ctx.position_counterpart_token, basic.token, basic.user, false)
                },
                _ => { (0, Zero::zero(), Zero::zero(), Zero::zero(), false) },
            }
        }

        // Order-agnostic pairing: sequentially group instructions by key (pool, collateral, debt, user)
        fn pair_instructions(
            self: @ContractState,
            instrs: Span<LendingInstruction>,
        ) -> Array<InstructionPair> {
            let mut pairs: Array<InstructionPair> = array![];
            let mut pending_index_opt: Option<usize> = Option::None(());
            let mut pending_pool: felt252 = 0;
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
                        // Match if same (pool, collateral, user) and debt equal or either one is zero
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

            // Flush any remaining pending as a single
            match pending_index_opt {
                Option::Some(pending_index) => {
                    pairs.append(InstructionPair { first: pending_index, second: 0, paired: false });
                },
                Option::None(()) => { },
            }

            pairs
        }
        fn get_vtoken_for_collateral(
            self: @ContractState, collateral: ContractAddress,
            pool_id: felt252,
        ) -> ContractAddress {
            let vesu_singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extensionForPool = vesu_singleton_dispatcher.extension(pool_id);
            let extension = IDefaultExtensionCLDispatcher { contract_address: extensionForPool };
            extension.v_token_for_collateral_asset(pool_id, collateral)
        }

        fn deposit(ref self: ContractState, instruction: @Deposit) -> ModifyPositionParams {
            let basic = *instruction.basic;
            let mut pool_id = self.pool_id.read();
            let mut debt_asset = Zero::zero(); // Zero debt token for deposit
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_id != Zero::zero() {
                    pool_id = vesu_context.pool_id;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }

            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            let result = erc20
                .transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // Approve singleton to spend tokens
            let singleton_address = self.vesu_singleton.read();
            let approve_result = erc20.approve(singleton_address, basic.amount);
            assert(approve_result, Errors::APPROVE_FAILED);

            // Use modify position to add collateral
            let collateral_asset = basic.token;
            let user = basic.user;

            // Create positive i257 for deposit
            let collateral_amount = I257Impl::new(basic.amount, false);
            self
                .build_modify_params_collateral(
                    pool_id, collateral_asset, debt_asset, user, collateral_amount,
                )
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) -> ModifyPositionParams {
            let basic = *instruction.basic;
            let mut pool_id = self.pool_id.read();
            let collateral_asset = basic.token;
            let mut debt_asset = Zero::zero(); // Zero debt token for withdraw
            let user = basic.user;
            self.assert_router_or_user(user);
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_id != Zero::zero() {
                    pool_id = vesu_context.pool_id;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }


            // Create negative i257 for withdraw
            let collateral_amount = I257Impl::new(basic.amount, true);
            self
                .build_modify_params_collateral(
                    pool_id, collateral_asset, debt_asset, user, collateral_amount,
                )
        }

        // @dev - moves the assets in vesu between a collateral + zero key to collateral + debt key.
        fn transfer_position_for(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: u256,
        ) {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position already exists
            let (position, _, _) = singleton_dispatcher
                .position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                let transfer_params = TransferPositionParams {
                    pool_id,
                    from_collateral_asset: collateral_asset,
                    to_collateral_asset: collateral_asset,
                    from_debt_asset: Zero::zero(),
                    to_debt_asset: debt_asset,
                    from_user: user,
                    to_user: user,
                    collateral: UnsignedAmount {
                        amount_type: AmountType::Target,
                        denomination: AmountDenomination::Native,
                        value: collateral_amount,
                    },
                    debt: Default::default(),
                    from_data: ArrayTrait::new().span(),
                    to_data: ArrayTrait::new().span(),
                };
                singleton_dispatcher.transfer_position(transfer_params);
            }
        }

        // @dev - calls modify on vesu with a delta in the collateral. This means both deposit and withdraw logic
        // is handled here. 
        fn build_modify_params_collateral(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257,
        ) -> ModifyPositionParams {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Get context which contains all position info
            let context = singleton_dispatcher.context(pool_id, collateral_asset, debt_asset, user);
            let vesu_context: Context = context;

            // If withdrawing, ensure we don't withdraw more than available
            let mut final_amount = collateral_amount;
            let mut amount_type = AmountType::Delta; // means we apply the delta from the current position size
            if collateral_amount.is_negative() {

                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_id);
                let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = vesu_context.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');

                if requested_shares >= available_shares {
                    // For exact or over withdrawals, use Target with 0
                    amount_type = AmountType::Target;
                    final_amount = I257Impl::new(0, false);
                } else {
                    // For partial withdrawals, use Delta with the negative amount
                    let max_assets = erc4626.convert_to_assets(requested_shares);
                    final_amount = I257Impl::new(max_assets, true);
                }
            }

            let modify_params = ModifyPositionParams {
                pool_id,
                collateral_asset,
                debt_asset,
                user,
                collateral: Amount {
                    amount_type, denomination: AmountDenomination::Assets, value: final_amount,
                },
                debt: Default::default(),
                data: ArrayTrait::new().span(),
            };
            modify_params
        }

        fn borrow(ref self: ContractState, instruction: @Borrow) -> ModifyPositionParams {
            let basic = *instruction.basic;
            let context = *instruction.context;
            self.assert_router_or_user(basic.user);
            assert(context.is_some(), 'Context is required for borrow');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_id = self.pool_id.read();
            if vesu_context.pool_id != Zero::zero() {
                pool_id = vesu_context.pool_id;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            // Create positive i257 for borrow
            let debt_amount = I257Impl::new(basic.amount, false);
            self.build_modify_params_debt(pool_id, collateral_asset, debt_asset, user, debt_amount)
        }


        fn repay(ref self: ContractState, instruction: @Repay) -> (ModifyPositionParams, u256, u256) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_id = self.pool_id.read();
            if vesu_context.pool_id != Zero::zero() {
                pool_id = vesu_context.pool_id;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            let current_debt = self.get_debt_for_user_position(*instruction);
            let to_repay = if basic.amount > current_debt { current_debt } else { basic.amount };

            let erc20 = IERC20Dispatcher { contract_address: debt_asset };

            // Transfer debt tokens from user to gateway
            let result = erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            let result = erc20.approve(self.vesu_singleton.read(), to_repay);
            assert(result, Errors::APPROVE_FAILED);

            // Create negative i257 for repay (reducing debt)
            let debt_amount = I257Impl::new(to_repay, true);
            let refund = if basic.amount > to_repay { basic.amount - to_repay } else { 0 };
            (self.build_modify_params_debt(pool_id, collateral_asset, debt_asset, user, debt_amount), to_repay, refund)
        }

        // @dev - This calls vesu to modify a position. Positions in vesu are marked by collateral/debt pairs,
        // so in case its a first time borrow on this pair transfer must be called first in order to switch the position
        // key in vesu.
        fn build_modify_params_debt(
            ref self: ContractState,
            pool_id: felt252,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257,
        ) -> ModifyPositionParams {
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            // Check if position exists
            let (position, _, _) = singleton_dispatcher
                .position(pool_id, collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // Transfer position from zero debt to target debt
                self.transfer_position_for(pool_id, collateral_asset, debt_asset, user, 0);
            }

            let modify_params = ModifyPositionParams {
                pool_id,
                collateral_asset,
                debt_asset,
                user,
                collateral: Default::default(),
                debt: Amount {
                    amount_type: AmountType::Delta,
                    denomination: AmountDenomination::Assets,
                    value: debt_amount,
                },
                data: ArrayTrait::new().span(),
            };
            modify_params
        }
        
        fn merge_modify_params(
            self: @ContractState,
            collateral_params: ModifyPositionParams,
            debt_params: ModifyPositionParams,
        ) -> ModifyPositionParams {
            let chosen_debt_asset = if debt_params.debt_asset != Zero::zero() { debt_params.debt_asset } else { collateral_params.debt_asset };
            ModifyPositionParams {
                pool_id: collateral_params.pool_id,
                collateral_asset: collateral_params.collateral_asset,
                debt_asset: chosen_debt_asset,
                user: collateral_params.user,
                collateral: collateral_params.collateral,
                debt: debt_params.debt,
                data: ArrayTrait::new().span(),
            }
        }

        fn is_amount_effective(self: @ContractState, amount: Amount) -> bool {
            let zero_i = I257Impl::new(0, false);
            amount.amount_type == AmountType::Target || amount.value != zero_i
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
        ) -> Array<ModifyPositionParams> {
            let mut params_list: Array<ModifyPositionParams> = ArrayTrait::new();
            for gidx in group {
                let idx = *gidx;
                match instructions.at(idx) {
                    LendingInstruction::Deposit(dep) => {
                        let p = self.deposit(dep);
                        params_list.append(p);
                    },
                    LendingInstruction::Withdraw(wd) => {
                        let p = self.withdraw(wd);
                        params_list.append(p);
                    },
                    LendingInstruction::Borrow(bor) => {
                        let p = self.borrow(bor);
                        params_list.append(p);
                    },
                    LendingInstruction::Repay(rep) => {
                        let (p, _, _) = self.repay(rep);
                        params_list.append(p);
                    },
                    _ => {}
                }
            };
            params_list
        }

        fn merge_and_execute(
            ref self: ContractState,
            params_list: Span<ModifyPositionParams>,
        ) -> UpdatePositionResponse {
            let singleton_dispatcher = ISingletonDispatcher { contract_address: self.vesu_singleton.read() };
            if params_list.len() == 2 {
                let first = *params_list.at(0);
                let second = *params_list.at(1);
                // Choose effective amounts regardless of instruction type
                let coll = if self.is_amount_effective(first.collateral) { first.collateral } else { second.collateral };
                let debt = if self.is_amount_effective(first.debt) { first.debt } else { second.debt };
                let chosen_debt_asset = if self.is_amount_effective(second.debt) { second.debt_asset } else { first.debt_asset };
                let merged = ModifyPositionParams {
                    pool_id: if first.pool_id != 0 { first.pool_id } else { second.pool_id },
                    collateral_asset: if first.collateral_asset != Zero::zero() { first.collateral_asset } else { second.collateral_asset },
                    debt_asset: if chosen_debt_asset != Zero::zero() { chosen_debt_asset } else { first.debt_asset },
                    user: if first.user != Zero::zero() { first.user } else { second.user },
                    collateral: coll,
                    debt: debt,
                    data: ArrayTrait::new().span(),
                };
                singleton_dispatcher.modify_position(merged)
            } else {
                let single = *params_list.at(0);
                singleton_dispatcher.modify_position(single)
            }
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
                        let dep = *dep;
                        let token = dep.basic.token;
                        let mut outs = array![];
                        outs.append(InstructionOutput { token, balance: 0 });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Withdraw(wd) => {
                        let wd = *wd;
                        let token = wd.basic.token;
                        if withdrawn > 0 { 
                            let erc20 = IERC20Dispatcher { contract_address: token }; 
                            assert(erc20.transfer(get_caller_address(), withdrawn), Errors::TRANSFER_FAILED); 
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token, balance: withdrawn });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Borrow(bor) => {
                        let bor = *bor;
                        let token = bor.basic.token;
                        if debt_changed > 0 { 
                            let erc20 = IERC20Dispatcher { contract_address: token }; 
                            assert(erc20.transfer(get_caller_address(), debt_changed), Errors::TRANSFER_FAILED); 
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token, balance: debt_changed });
                        outs_all.append(outs.span());
                    },
                    LendingInstruction::Repay(rep) => {
                        let rep = *rep;
                        let token = rep.basic.token;
                        let requested = rep.basic.amount;
                        let repaid = debt_changed;
                        let refund = if requested > repaid { requested - repaid } else { 0 };
                        if refund > 0 { 
                            let erc20 = IERC20Dispatcher { contract_address: token }; 
                            assert(erc20.transfer(get_caller_address(), refund), Errors::TRANSFER_FAILED); 
                        }
                        let mut outs = array![];
                        outs.append(InstructionOutput { token, balance: repaid });
                        outs.append(InstructionOutput { token, balance: refund });
                        outs_all.append(outs.span());
                    },
                    _ => {}
                }
            };
            outs_all
        }

        // @dev - helper function that should be used in places that bring money OUT of the lending protocols.
        // Basically the router is trusted to have done user verifications OR the user can call this contract directly.
        fn assert_router_or_user(self: @ContractState, user: ContractAddress) {
            let router = self.router.read();
            assert(router == get_caller_address() || user == get_caller_address(), 'unauthorized');
        }

        // @dev - internal helper to compute user's current debt for a position using repay context
        fn get_debt_for_user_position(self: @ContractState, repay: Repay) -> u256 {
            let context = repay.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes: Span<felt252> = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
            let singleton = ISingletonDispatcher { contract_address: self.vesu_singleton.read() };
            let mut pool_id = self.pool_id.read();
            if vesu_context.pool_id != Zero::zero() {
                pool_id = vesu_context.pool_id;
            }
            // Touch context to ensure any lazy updates are reflected
            let _ctx = singleton.context(
                pool_id,
                vesu_context.position_counterpart_token,
                repay.basic.token,
                repay.basic.user,
            );
            let (_, _, debt) = singleton.position(
                pool_id,
                vesu_context.position_counterpart_token,
                repay.basic.token,
                repay.basic.user,
            );
            debt
        }
    }

    #[abi(embed_v0)]
impl IVesuGatewayAdminImpl of IVesuGatewayAdmin<ContractState> {
    fn add_pool(ref self: ContractState, pool: felt252) {
        self.ownable.assert_only_owner();
        self.supported_pools.push(pool);
    }

    fn add_pool_collaterals(ref self: ContractState, pool: felt252, assets: Array<ContractAddress>) {
        self.ownable.assert_only_owner();
        let mut vec = self.supported_pool_collaterals.entry(pool);
        for a in assets { vec.push(a); };
    }

    fn add_pool_debts(ref self: ContractState, pool: felt252, assets: Array<ContractAddress>) {
        self.ownable.assert_only_owner();
        let mut vec = self.supported_pool_debts.entry(pool);
        for a in assets { vec.push(a); };
    }
}

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
                let params_list = self.build_params_for_group(instructions, group.span());
                let response = self.merge_and_execute(params_list.span());
                let outs_arr = self.post_actions_for_group(instructions, group.span(), response);
                for j in 0..outs_arr.len() {
                    results.append(*outs_arr.at(j));
                }
                i += 1;
            };
            results.span()
        }

        // @dev - helper function that returns encoded calls which are either approvals for tokens or approval in vesu for 
        // borrowing/managing collateral on the users behalf. This approval is quite critical as it allows this contract to act on a
        // users behalf so other users shouldn't be able to call pretending to be someone else as funds are transfered to callers.
        fn get_authorizations_for_instructions(ref self: ContractState, instructions: Span<LendingInstruction>, rawSelectors: bool) -> Span<(ContractAddress, felt252, Array<felt252>)> {
            let mut authorizations = ArrayTrait::new();
            for instruction in instructions {
                match instruction {
                    LendingInstruction::Deposit(deposit_params) => {
                        let token = *deposit_params.basic.token;
                        let amount = deposit_params.basic.amount;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Repay(repay_params) => {
                        let token = *repay_params.basic.token;
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_caller_address(), ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(repay_params.basic.amount, ref call_data);
                        let selector = if !rawSelectors { 'approve' } else { selector!("approve") };
                        authorizations.append((token, selector, call_data));
                    },
                    LendingInstruction::Borrow(borrow_params) => {
                        let mut pool_id = self.pool_id.read();
                        let singleton = self.vesu_singleton.read();
                        if borrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*borrow_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((singleton, selector, call_data));
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        let mut pool_id = self.pool_id.read();
                        let singleton = self.vesu_singleton.read();
                        if withdraw_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*withdraw_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((singleton, selector, call_data));
                    },
                    LendingInstruction::Reborrow(reborrow_params) => {
                        let mut pool_id = self.pool_id.read();
                        let singleton = self.vesu_singleton.read();
                        if reborrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*reborrow_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_id != Zero::zero() {
                                pool_id = vesu_context.pool_id;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@pool_id, ref call_data); //todo - this is a hack to get the address of the router..
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((singleton, selector, call_data));
                    },
                    _ => {}
                }
            };
            return authorizations.span();
        }

        // @dev - for a given repay instruction, pulls the current debt amount.
        fn get_flash_loan_amount(ref self: ContractState, repay: Repay) -> u256 {
            let mut amount = repay.basic.amount;
            if repay.repay_all {
                amount = self.get_debt_for_user_position(repay);
            }
            amount
        }
    }
    use crate::interfaces::IGateway::InterestRateView;
    use alexandria_math::{pow};

    #[abi(embed_v0)]
    impl InterestRateViewImpl of InterestRateView<ContractState> {
        // @dev - UI only. Ignore
        fn get_borrow_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            // Get rate information from the singleton
            let utilization = singleton_dispatcher.utilization(pool_id, token_address);
            let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, token_address);
            let interest_per_second = extension.interest_rate(
                pool_id,
                token_address,
                utilization,
                asset_config.last_updated,
                asset_config.last_full_utilization_rate,
            );

            // Convert to APR (multiply by YEAR_IN_SECONDS and divide by SCALE)
            let year_in_seconds: u256 = 31536000; // 365 days
            let scale: u256 = pow(10,10);
            let borrow_rate = (interest_per_second * year_in_seconds) ;

            // Return rate and scale
            borrow_rate
        }

        // @dev - UI only. Ignore
        fn get_supply_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };
    
            // Fetch rate data
            let utilization = singleton_dispatcher.utilization(pool_id, token_address);
            let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, token_address);
            let interest_per_second = extension.interest_rate(
                pool_id,
                token_address,
                utilization,
                asset_config.last_updated,
                asset_config.last_full_utilization_rate,
            );
    
            let year_in_seconds: u256 = 31536000;
            let scale: u256 = pow(10, 18);
    
            // 1. Compute numerator: interest * year * total_debt * last_rate (no divisions yet)
            let mut numerator = interest_per_second * year_in_seconds;
            numerator = numerator * asset_config.total_nominal_debt;
            numerator = numerator * asset_config.last_rate_accumulator;
    
            // 2. Compute denominator components with scaling
            let reserve_scale_part = (asset_config.reserve * scale) / asset_config.scale;
            let total_borrowed_part = (asset_config.total_nominal_debt * asset_config.last_rate_accumulator) / scale;
    
            // 3. Combine denominator and scale it
            let denominator = (reserve_scale_part + total_borrowed_part) * scale;
    
            // 4. Final division (precision preserved)
            let supply_rate = numerator / denominator;
    
            supply_rate
        }
    }

    use core::dict::{Felt252Dict, Felt252DictTrait, Felt252DictEntryTrait};
    
    #[abi(embed_v0)]
    impl IVesuViewerImpl of IVesuViewer<ContractState> {
        // @dev - This is only used for UI purposes.
        fn get_supported_assets_array(self: @ContractState, pool_id: felt252) -> Array<ContractAddress> {
            let mut assets = array![];
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            // Build union(collaterals ∪ debts) for the pool
            let mut seen: Felt252Dict<u8> = Default::default();
            let coll_vec = self.supported_pool_collaterals.entry(pool_id);
            let debts_vec = self.supported_pool_debts.entry(pool_id);
            for i in 0..coll_vec.len() {
                let a = coll_vec.at(i).read();
                if seen.get(a.into()) == 0 { assets.append(a); seen.insert(a.into(), 1); }
            };
            for i in 0..debts_vec.len() {
                let a = debts_vec.at(i).read();
                if seen.get(a.into()) == 0 { assets.append(a); seen.insert(a.into(), 1); }
            };
            assets
        }

        // @dev - This is only used for UI purposes.
        fn get_supported_assets_info(self: @ContractState, user: ContractAddress, pool_id: felt252) -> Array<(ContractAddress, felt252, u8, u256)> {
            let mut assets = array![];
            // union(collaterals ∪ debts) for the pool
            let coll_vec = self.supported_pool_collaterals.entry(pool_id);
            let debts_vec = self.supported_pool_debts.entry(pool_id);
            let mut seen: Felt252Dict<u8> = Default::default();
            let mut pool_assets: Array<ContractAddress> = array![];
            for i in 0..coll_vec.len() {
                let a = coll_vec.at(i).read();
                if seen.get(a.into()) == 0 { pool_assets.append(a); seen.insert(a.into(), 1); }
            };
            for i in 0..debts_vec.len() {
                let a = debts_vec.at(i).read();
                if seen.get(a.into()) == 0 { pool_assets.append(a); seen.insert(a.into(), 1); }
            };

            let positions = self.get_all_positions(user, pool_id);
            let mut positions_map : Felt252Dict<u32> = Default::default();
            for number in 0..positions.len() {
                let ( collateral_asset, _, _ ) = positions.at(number);
                positions_map.insert((*collateral_asset).into(), number+1);
            };

            let plen = pool_assets.len();
            for i in 0..plen {
                let underlying = *pool_assets.at(i);
                let symbol = IERC20SymbolDispatcher { contract_address: underlying }.symbol();
                let decimals = IERC20MetadataDispatcher { contract_address: underlying }.decimals();
                let mut number = positions_map.get(underlying.into());
                let mut collateral_amount = 0;
                if number != 0 {
                    number -= 1;
                    let position = positions.at(number);
                    let ( _, _, position_with_amounts ) = position;
                    collateral_amount = *position_with_amounts.collateral_amount;
                }
                assets.append((underlying, symbol, decimals, collateral_amount));
            };
            assets
        }
        
        // @dev - This is only used for UI purposes.
        fn get_all_positions(
            self: @ContractState, user: ContractAddress, pool_id: felt252
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            // Use pool-specific collateral allowlist
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            let coll = self.supported_pool_collaterals.entry(pool_id);
            let len = coll.len();
            self.get_all_positions_range(user, pool_id, 0, len.try_into().unwrap())
        }

        // @dev - Paginated version to avoid exceeding RPC step limits. Iterates collateral assets in [start_index, end_index).
        fn get_all_positions_range(
            self: @ContractState,
            user: ContractAddress,
            pool_id: felt252,
            start_index: usize,
            end_index: usize,
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            let mut positions = array![];
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            // Collateral allowlist for this pool
            let coll_vec = self.supported_pool_collaterals.entry(pool_id);
            let coll_len = coll_vec.len();
            // Clamp within collaterals
            let start = if start_index > coll_len.try_into().unwrap() { coll_len.try_into().unwrap() } else { start_index };
            let end = if end_index > coll_len.try_into().unwrap() { coll_len.try_into().unwrap() } else { end_index };

            // Iterate through the requested range of collateral assets
            let mut i = start;
            while i != end {
                let collateral_asset = coll_vec.at(i.try_into().unwrap()).read();

                // Check vtoken balance first
                let vtoken = extension.v_token_for_collateral_asset(pool_id, collateral_asset);
                let erc20 = IERC20Dispatcher { contract_address: vtoken };
                let vtoken_balance = erc20.balance_of(user);
                if vtoken_balance > 0 {
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(vtoken_balance);
                    positions
                        .append(
                            (
                                collateral_asset,
                                Zero::zero(),
                                PositionWithAmounts {
                                    collateral_shares: vtoken_balance,
                                    collateral_amount,
                                    nominal_debt: 0,
                                    is_vtoken: true,
                                },
                            ),
                        );
                }

                // Check position with zero debt (earning positions)
                let (position, _, _) = singleton_dispatcher
                    .position(pool_id, collateral_asset, Zero::zero(), user);
                if position.collateral_shares > 0 {
                    let vtoken = extension.v_token_for_collateral_asset(pool_id, collateral_asset);
                    let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                    let collateral_amount = erc4626.convert_to_assets(position.collateral_shares);
                    positions
                        .append(
                            (
                                collateral_asset,
                                Zero::zero(),
                                PositionWithAmounts {
                                    collateral_shares: position.collateral_shares,
                                    collateral_amount,
                                    nominal_debt: position.nominal_debt,
                                    is_vtoken: false,
                                },
                            ),
                        );
                }

                // Then check all allowed debt assets for this pool
                let debts_vec = self.supported_pool_debts.entry(pool_id);
                let dlen = debts_vec.len();
                for j in 0..dlen {
                    let debt_asset = debts_vec.at(j).read();
                    if debt_asset == collateral_asset { continue; }
                    let (position, _, debt) = singleton_dispatcher
                        .position(pool_id, collateral_asset, debt_asset, user);
                    if position.collateral_shares > 0 || position.nominal_debt > 0 {
                        let vtoken = extension
                            .v_token_for_collateral_asset(pool_id, collateral_asset);
                        let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                        let collateral_amount = erc4626
                            .convert_to_assets(position.collateral_shares);
                        positions
                            .append(
                                (
                                    collateral_asset,
                                    debt_asset,
                                    PositionWithAmounts {
                                        collateral_shares: position.collateral_shares,
                                        collateral_amount,
                                        nominal_debt: debt,
                                        is_vtoken: false,
                                    },
                                ),
                            );
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
            let pool_id = if ctx.pool_id == Zero::zero() { self.pool_id.read() } else { ctx.pool_id };
            let collateral_asset = if is_debt_context { other_token } else { ctx.position_counterpart_token };
            let debt_asset = if is_debt_context { ctx.position_counterpart_token } else { other_token };
            let singleton_dispatcher = ISingletonDispatcher { contract_address: self.vesu_singleton.read() };
            let extension = IDefaultExtensionCLDispatcher { contract_address: singleton_dispatcher.extension(pool_id) };
            let (position, _, debt) = singleton_dispatcher.position(pool_id, collateral_asset, debt_asset, user);
            let vtoken = extension.v_token_for_collateral_asset(pool_id, collateral_asset);
            let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
            let collateral_amount = erc4626.convert_to_assets(position.collateral_shares);
            (
                collateral_asset,
                debt_asset,
                PositionWithAmounts {
                    collateral_shares: position.collateral_shares,
                    collateral_amount,
                    nominal_debt: debt,
                    is_vtoken: false,
                },
            )
        }

        // @dev - This is only used for UI purposes.
        fn get_asset_price(self: @ContractState, asset: ContractAddress) -> u256 {
            let pool_id = self.pool_id.read();
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };
            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };
            let price = extension.price(pool_id, asset);
            price.value
        }

        // @dev - This is only used for UI purposes.
        fn get_supported_assets_ui(self: @ContractState, pool_id: felt252) -> Array<TokenMetadata> {
            let mut assets = array![];
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            let singleton_dispatcher = ISingletonDispatcher {
                contract_address: self.vesu_singleton.read(),
            };

            let extension = IDefaultExtensionCLDispatcher {
                contract_address: singleton_dispatcher.extension(pool_id),
            };

            // Build union(collaterals ∪ debts) for this pool
            let mut seen: Felt252Dict<u8> = Default::default();
            let mut pool_assets: Array<ContractAddress> = array![];
            let coll_vec = self.supported_pool_collaterals.entry(pool_id);
            let debts_vec = self.supported_pool_debts.entry(pool_id);
            for i in 0..coll_vec.len() {
                let a = coll_vec.at(i).read();
                if seen.get(a.into()) == 0 { pool_assets.append(a); seen.insert(a.into(), 1); }
            };
            for i in 0..debts_vec.len() {
                let a = debts_vec.at(i).read();
                if seen.get(a.into()) == 0 { pool_assets.append(a); seen.insert(a.into(), 1); }
            };

            let ulen = pool_assets.len();
            for i in 0..ulen {
                let asset = *pool_assets.at(i);

                let dispatcher = IERC20SymbolDispatcher { contract_address: asset };
                let symbol_felt = dispatcher.symbol();

                let decimals = IERC20MetadataDispatcher { contract_address: asset }.decimals();

                // Get rate information from the singleton
                let rate_accumulator = singleton_dispatcher.rate_accumulator(pool_id, asset);
                let utilization = singleton_dispatcher.utilization(pool_id, asset);
                let (asset_config, _) = singleton_dispatcher.asset_config(pool_id, asset);
                let fee_rate = extension
                    .interest_rate(
                        pool_id,
                        asset,
                        utilization,
                        asset_config.last_updated,
                        asset_config.last_full_utilization_rate,
                    );
                let price = extension.price(pool_id, asset);

                let metadata = TokenMetadata {
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
                };
                assets.append(metadata.into());
            };
            assets
        }

        fn get_supported_collateral_assets(self: @ContractState, pool_id: felt252) -> Array<ContractAddress> {
            let mut assets = array![];
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            let coll_vec = self.supported_pool_collaterals.entry(pool_id);
            for i in 0..coll_vec.len() {
                let asset = coll_vec.at(i).read();
                assets.append(asset);
            };
            assets
        }

        fn get_supported_debt_assets(self: @ContractState, pool_id: felt252) -> Array<ContractAddress> {
            let mut assets = array![];
            let pool_id = if pool_id == Zero::zero() { self.pool_id.read() } else { pool_id };
            let debts_vec = self.supported_pool_debts.entry(pool_id);
            for i in 0..debts_vec.len() {
                let asset = debts_vec.at(i).read();
                assets.append(asset);
            };
            assets
        }
    }
}
