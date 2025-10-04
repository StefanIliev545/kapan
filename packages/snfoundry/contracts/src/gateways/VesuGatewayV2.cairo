use core::array::{Array, Span};
use core::byte_array::ByteArrayTrait;
use openzeppelin::token::erc20::interface::{
    IERC20Dispatcher, IERC20DispatcherTrait, IERC20MetadataDispatcher,
    IERC20MetadataDispatcherTrait,
};
use starknet::ContractAddress;
use crate::interfaces::vesu_v2::{AssetPrice, Position, IPoolDispatcher, IPoolDispatcherTrait, IERC4626Dispatcher, IERC4626DispatcherTrait};
use core::num::traits::Pow;
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
    fn get_supported_assets_info(self: @TContractState, user: ContractAddress, pool_address: ContractAddress) -> Array<(ContractAddress, felt252, u8, u256)>;
    fn get_supported_assets_ui(self: @TContractState, pool_address: ContractAddress) -> Array<TokenMetadata>;
    fn get_asset_price(self: @TContractState, asset: ContractAddress, pool_address: ContractAddress) -> u256;
    // New: paginated positions fetch to avoid RPC step limits
    fn get_all_positions_range(
        self: @TContractState,
        user: ContractAddress,
        pool_address: ContractAddress,
        start_index: usize,
        end_index: usize,
    ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)>;
}

#[derive(Drop, Serde)]
pub struct VesuContext {
    // V2: Now uses pool address instead of pool_id. Debt is isolated in pairs to a collateral.
    pub pool_address: ContractAddress, // This allows targeting a specific pool contract.
    pub position_counterpart_token: ContractAddress // This is either the collateral or the debt token depending on the instruction.
}

#[starknet::interface]
trait IERC20Symbol<TContractState> {
    fn symbol(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod VesuGatewayV2 {
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
        Borrow, Deposit, ILendingInstructionProcessor, LendingInstruction, Repay, Withdraw, InstructionOutput,
    };
    use crate::interfaces::vesu_v2::{
        Amount, AmountDenomination, Context, ModifyPositionParams, Position,
        UpdatePositionResponse, IPoolDispatcher, IPoolDispatcherTrait, 
        IERC4626Dispatcher, IERC4626DispatcherTrait
    };
    use alexandria_math::i257::{I257Impl, i257};
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
        // V2: Store pool addresses instead of singleton + pool_id
        default_pool: ContractAddress,
        supported_assets: Vec<ContractAddress>,
        supported_pools: Vec<ContractAddress>, // V2: Now stores pool addresses
        supported_pool_assets: Map<ContractAddress, Vec<ContractAddress>>, // V2: Use pool address as key
        router: ContractAddress,
        #[substorage(v0)]
        ownable: OwnableComponent::Storage,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        default_pool: ContractAddress,
        router: ContractAddress,
        owner: ContractAddress,
        supported_assets: Array<ContractAddress>,
    ) {
        self.default_pool.write(default_pool);
        self.router.write(router);
        self.ownable.initializer(owner);
        for asset in supported_assets {
            self.supported_assets.append().write(asset);
        }
    }

    #[generate_trait]
    impl VesuGatewayInternal of IVesuGatewayInternal {
        fn get_vtoken_for_collateral(
            self: @ContractState, collateral: ContractAddress,
            pool_address: ContractAddress,
        ) -> ContractAddress {
            // V2: Get vtoken directly from pool's ERC4626 interface
            // For now, we'll assume collateral asset IS the vtoken or use a mapping
            // This needs to be implemented based on V2 pool structure
            collateral // Placeholder - needs proper V2 implementation
        }

        fn deposit(ref self: ContractState, instruction: @Deposit) {
            println!("depositing");
            let basic = *instruction.basic;
            let mut pool_address = self.default_pool.read();
            let mut debt_asset = Zero::zero(); // Zero debt token for deposit
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_address != Zero::zero() {
                    pool_address = vesu_context.pool_address;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }

            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            let result = erc20
                .transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // V2: Approve pool to spend tokens
            let approve_result = erc20.approve(pool_address, basic.amount);
            assert(approve_result, Errors::APPROVE_FAILED);

            // Use modify position to add collateral
            let collateral_asset = basic.token;
            let user = basic.user;
            // Create positive i257 for deposit
            let collateral_amount = I257Impl::new(basic.amount, false);
            let response = self
                .modify_collateral_for(
                    pool_address, collateral_asset, debt_asset, user, collateral_amount,
                );
            println!("deposited");
        }

        fn withdraw(ref self: ContractState, instruction: @Withdraw) {
            let basic = *instruction.basic;
            let mut pool_address = self.default_pool.read();
            let collateral_asset = basic.token;
            let mut debt_asset = Zero::zero(); // Zero debt token for withdraw
            let user = basic.user;
            self.assert_router_or_user(user);
            if instruction.context.is_some() {
                let mut context_bytes: Span<felt252> = (*instruction.context).unwrap();
                let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                if vesu_context.pool_address != Zero::zero() {
                    pool_address = vesu_context.pool_address;
                }
                if vesu_context.position_counterpart_token != Zero::zero() {
                    debt_asset = vesu_context.position_counterpart_token;
                }
            }

        
            // Create negative i257 for withdraw
            let collateral_amount = I257Impl::new(basic.amount, true);
            let response = self
                .modify_collateral_for(
                    pool_address, collateral_asset, debt_asset, user, collateral_amount,
                );

            // Transfer tokens back to user using the actual amount withdrawn
            let erc20 = IERC20Dispatcher { contract_address: basic.token };
            let result = erc20.transfer(get_caller_address(), response.collateral_delta.abs());
            assert(result, Errors::TRANSFER_FAILED);
        }

        // V2: calls modify on pool with a delta in the collateral. This means both deposit and withdraw logic
        // is handled here. 
        fn modify_collateral_for(
            ref self: ContractState,
            pool_address: ContractAddress,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: i257,
        ) -> UpdatePositionResponse {
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };

            // Get context which contains all position info
            println!("getting context for {:?} {:?} {:?}", collateral_asset, debt_asset, user);
            let context = pool_dispatcher.context(debt_asset, collateral_asset, user);
            println!("got context");
            let vesu_context: Context = context;

            // If withdrawing, ensure we don't withdraw more than available
            let mut final_amount = collateral_amount;
            if collateral_amount.is_negative() {
                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
                let erc4626 = IERC4626Dispatcher { contract_address: vtoken };
                let requested_shares = erc4626.convert_to_shares(collateral_amount.abs());
                let available_shares = vesu_context.position.collateral_shares;
                assert(available_shares > 0, 'No-collateral');

                if requested_shares >= available_shares {
                    // For exact or over withdrawals, set to 0 (withdraw all)
                    final_amount = I257Impl::new(0, false);
                } else {
                    // For partial withdrawals, use the negative amount
                    let max_assets = erc4626.convert_to_assets(requested_shares);
                    final_amount = I257Impl::new(max_assets, true);
                }
            }

            // V2: No pool_id, AmountType enum, or data fields
            let modify_params = ModifyPositionParams {
                collateral_asset,
                debt_asset,
                user,
                collateral: Amount {
                    denomination: AmountDenomination::Assets, 
                    value: final_amount,
                },
                debt: Default::default(),
            };
            println!("modifying position");
            pool_dispatcher.modify_position(modify_params)
        }

        fn borrow(ref self: ContractState, instruction: @Borrow) {
            println!("borrowing");
            let basic = *instruction.basic;
            let context = *instruction.context;
            self.assert_router_or_user(basic.user);
            assert(context.is_some(), 'Context is required for borrow');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_address = self.default_pool.read();
            if vesu_context.pool_address != Zero::zero() {
                pool_address = vesu_context.pool_address;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            // Create positive i257 for borrow
            let debt_amount = I257Impl::new(basic.amount, false);
            self.modify_debt_for(pool_address, collateral_asset, debt_asset, user, debt_amount);

            // Transfer debt tokens to user
            let erc20 = IERC20Dispatcher { contract_address: debt_asset };
            let result = erc20.transfer(get_caller_address(), erc20.balance_of(get_contract_address()));
            assert(result, Errors::TRANSFER_FAILED);
            println!("borrowed");
        }

        fn repay(ref self: ContractState, instruction: @Repay) {
            let basic = *instruction.basic;
            let context = *instruction.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();

            let mut pool_address = self.default_pool.read();
            if vesu_context.pool_address != Zero::zero() {
                pool_address = vesu_context.pool_address;
            }
            let user = basic.user;
            let collateral_asset = vesu_context.position_counterpart_token;
            let debt_asset = basic.token;

            let erc20 = IERC20Dispatcher { contract_address: debt_asset };
            let balance_before = erc20.balance_of(get_contract_address());

            // Transfer debt tokens from user to gateway
            let result = erc20.transfer_from(get_caller_address(), get_contract_address(), basic.amount);
            assert(result, Errors::TRANSFER_FAILED);

            // V2: Approve pool to spend tokens
            let result = erc20.approve(pool_address, basic.amount);
            assert(result, Errors::APPROVE_FAILED);

            // Create negative i257 for repay (reducing debt)
            let debt_amount = I257Impl::new(basic.amount, true);
            self.modify_debt_for(pool_address, collateral_asset, debt_asset, user, debt_amount);

            let balance_after = erc20.balance_of(get_contract_address());
            let remainder = balance_after - balance_before; // balance after should be equal or bigger always.
            if remainder > 0 {
                assert(erc20.transfer(get_caller_address(), remainder), 'transfer failed');
            }
        }

        // V2: This calls pool to modify a position. Positions in vesu are marked by collateral/debt pairs,
        // In V2, we handle position creation differently since transfer_position is removed
        fn modify_debt_for(
            ref self: ContractState,
            pool_address: ContractAddress,
            collateral_asset: ContractAddress,
            debt_asset: ContractAddress,
            user: ContractAddress,
            debt_amount: i257,
        ) {
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };

            // Check if position exists
            let (position, _, _) = pool_dispatcher
                .position(collateral_asset, debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // V2: Use migrate_position_for to handle position migration
                self.migrate_position_for(
                    pool_address, 
                    collateral_asset, 
                    Zero::zero(), // from zero debt
                    debt_asset,   // to target debt
                    user, 
                    0
                );
            }

            // V2: No pool_id, AmountType enum, or data fields
            let modify_params = ModifyPositionParams {
                collateral_asset,
                debt_asset,
                user,
                collateral: Default::default(),
                debt: Amount {
                    denomination: AmountDenomination::Assets,
                    value: debt_amount,
                },
            };
            pool_dispatcher.modify_position(modify_params);
        }

        // @dev - helper function that should be used in places that bring money OUT of the lending protocols.
        // Basically the router is trusted to have done user verifications OR the user can 1this contract directly.
        fn assert_router_or_user(self: @ContractState, user: ContractAddress) {
            let router = self.router.read();
            assert(router == get_caller_address() || user == get_caller_address(), 'unauthorized');
        }

        // V2: internal helper to compute user's current debt for a position using repay context
        fn get_debt_for_user_position(self: @ContractState, repay: Repay) -> u256 {
            let context = repay.context;
            assert(context.is_some(), 'Context is required for repay');
            let mut context_bytes: Span<felt252> = context.unwrap();
            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
            let mut pool_address = self.default_pool.read();
            if vesu_context.pool_address != Zero::zero() {
                pool_address = vesu_context.pool_address;
            }
            let pool = IPoolDispatcher { contract_address: pool_address };
            // Touch context to ensure any lazy updates are reflected
            let _ctx = pool.context(
                vesu_context.position_counterpart_token,
                repay.basic.token,
                repay.basic.user,
            );
            let (_, _, debt) = pool.position(
                vesu_context.position_counterpart_token,
                repay.basic.token,
                repay.basic.user,
            );
            debt
        }

        // V2: Replace transfer_position with withdraw + deposit for position migration
        // This handles moving collateral from zero debt position to a position with specific debt asset
        fn migrate_position_for(
            ref self: ContractState,
            pool_address: ContractAddress,
            collateral_asset: ContractAddress,
            from_debt_asset: ContractAddress,
            to_debt_asset: ContractAddress,
            user: ContractAddress,
            collateral_amount: u256,
        ) {
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };

            // Check if target position already exists
            let (position, _, _) = pool_dispatcher
                .position(collateral_asset, to_debt_asset, user);
            if position.collateral_shares == 0 && position.nominal_debt == 0 {
                // V2: Since transfer_position is removed, we handle this by:
                // 1. Withdrawing from the old position (collateral + from_debt_asset)
                // 2. Depositing to the new position (collateral + to_debt_asset)
                // This only works when from_debt_asset is Zero (no existing debt to manage)
                if from_debt_asset == Zero::zero() {
                    // Step 1: Withdraw all collateral from zero debt position
                    let modify_params_withdraw = ModifyPositionParams {
                        collateral_asset,
                        debt_asset: Zero::zero(),
                        user,
                        collateral: Amount {
                            denomination: AmountDenomination::Assets,
                            value: I257Impl::new(collateral_amount, true), // negative = withdraw
                        },
                        debt: Default::default(),
                    };
                    pool_dispatcher.modify_position(modify_params_withdraw);

                    // Step 2: Deposit to new position with target debt asset
                    let modify_params_deposit = ModifyPositionParams {
                        collateral_asset,
                        debt_asset: to_debt_asset,
                        user,
                        collateral: Amount {
                            denomination: AmountDenomination::Assets,
                            value: I257Impl::new(collateral_amount, false), // positive = deposit
                        },
                        debt: Default::default(),
                    };
                    pool_dispatcher.modify_position(modify_params_deposit);
                } else {
                    // Complex case: moving between non-zero debt assets would need flash loan
                    // For now, this is not implemented as it's more complex
                    assert(false, 'unsupported-migration');
                }
            }
        }
    }

    #[abi(embed_v0)]
    impl IVesuGatewayAdminImpl of IVesuGatewayAdmin<ContractState> {
        fn add_asset(ref self: ContractState, asset: ContractAddress) {
            self.ownable.assert_only_owner();
            self.supported_assets.append().write(asset);
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

    #[abi(embed_v0)]
    impl ILendingInstructionProcessorImpl of ILendingInstructionProcessor<ContractState> {
        fn process_instructions(ref self: ContractState, instructions: Span<LendingInstruction>) -> Span<Span<InstructionOutput>> {
            let mut outputs = ArrayTrait::new();
            let mut i: usize = 0;
            while i != instructions.len() {
                let mut instruction_outputs = ArrayTrait::new();
                match instructions.at(i) {
                    LendingInstruction::Deposit(deposit_params) => {
                        self.deposit(deposit_params);
                        instruction_outputs.append(crate::interfaces::IGateway::InstructionOutput {
                            token: *deposit_params.basic.token,
                            balance: 0, // V2: Would need to track actual balance changes
                        });
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        self.withdraw(withdraw_params);
                        instruction_outputs.append(crate::interfaces::IGateway::InstructionOutput {
                            token: *withdraw_params.basic.token,
                            balance: 0, // V2: Would need to track actual balance changes
                        });
                    },
                    LendingInstruction::Borrow(borrow_params) => { 
                        self.borrow(borrow_params);
                        instruction_outputs.append(crate::interfaces::IGateway::InstructionOutput {
                            token: *borrow_params.basic.token,
                            balance: 0, // V2: Would need to track actual balance changes
                        });
                    },
                    LendingInstruction::Repay(repay_params) => { 
                        self.repay(repay_params);
                        instruction_outputs.append(crate::interfaces::IGateway::InstructionOutput {
                            token: *repay_params.basic.token,
                            balance: 0, // V2: Would need to track actual balance changes
                        });
                    },
                    _ => {}
                }
                outputs.append(instruction_outputs.span());
                i += 1;
            };
            outputs.span()
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
                        let mut pool_address = self.default_pool.read();
                        if borrow_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*borrow_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_address != Zero::zero() {
                                pool_address = vesu_context.pool_address;
                            }
                        }
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((pool_address, selector, call_data));
                    },
                    LendingInstruction::Withdraw(withdraw_params) => {
                        let mut pool_address = self.default_pool.read();
                        if withdraw_params.context.is_some() {
                            let mut context_bytes: Span<felt252> = (*withdraw_params).context.unwrap();
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_address != Zero::zero() {
                                pool_address = vesu_context.pool_address;
                            }
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
                            let vesu_context: VesuContext = Serde::deserialize(ref context_bytes).unwrap();
                            if vesu_context.pool_address != Zero::zero() {
                                pool_address = vesu_context.pool_address;
                            }
                        }
                        let pool_address_felt: felt252 = pool_address.into();
                        print!("pool_address: {}", pool_address_felt);
                        let mut call_data: Array<felt252> = array![];
                        Serde::serialize(@get_contract_address(), ref call_data);
                        Serde::serialize(@true, ref call_data);
                        let selector = if !rawSelectors { 'modify_delegation' } else { selector!("modify_delegation") };
                        authorizations.append((pool_address, selector, call_data));
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
        // V2: UI only - now uses pool directly
        fn get_borrow_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_address = self.default_pool.read();
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };
            let rate_accumulator = pool_dispatcher.rate_accumulator(token_address);
            let utilization = pool_dispatcher.utilization(token_address);
            let (asset_config, _) = pool_dispatcher.asset_config(token_address);
            
            // V2: Calculate borrow rate using V2 formula
            let base_rate = asset_config.last_full_utilization_rate;
            let utilization_factor = utilization * base_rate / 1000000000000000000000000000; // SCALE
            let borrow_rate = base_rate + utilization_factor;
            
            borrow_rate
        }

        fn get_supply_rate(ref self: ContractState, token_address: ContractAddress) -> u256 {
            let pool_address = self.default_pool.read();
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };
            let rate_accumulator = pool_dispatcher.rate_accumulator(token_address);
            let utilization = pool_dispatcher.utilization(token_address);
            let (asset_config, _) = pool_dispatcher.asset_config(token_address);
            
            // V2: Calculate supply rate using V2 formula
            let base_rate = asset_config.last_full_utilization_rate;
            let utilization_factor = utilization * base_rate / 1000000000000000000000000000; // SCALE
            let borrow_rate = base_rate + utilization_factor;
            
            // Supply rate is borrow rate * utilization
            let supply_rate = if utilization > 0 { borrow_rate * utilization / 1000000000000000000000000000 } else { 0 };
    
            supply_rate
        }
    }

    use core::dict::{Felt252Dict, Felt252DictTrait, Felt252DictEntryTrait};
    
    #[abi(embed_v0)]
    impl IVesuViewerImpl of IVesuViewer<ContractState> {
        // @dev - This is only used for UI purposes.
        fn get_supported_assets_array(self: @ContractState) -> Array<ContractAddress> {
            let mut assets = array![];
            let supported_assets = self.supported_assets;
            let len = supported_assets.len();
            for i in 0..len {
                assets.append(self.supported_assets.at(i).read());
            };
            assets
        }

        // V2: This is only used for UI purposes.
        fn get_supported_assets_info(self: @ContractState, user: ContractAddress, pool_address: ContractAddress) -> Array<(ContractAddress, felt252, u8, u256)> {
            let mut assets = array![];
            let supported_assets = self.supported_assets;
            let len = supported_assets.len();

            let positions = self.get_all_positions(user, pool_address);
            let mut positions_map : Felt252Dict<u32> = Default::default();

            for number in 0..positions.len() {
                let ( collateral_asset, _, _ ) = positions.at(number);
                positions_map.insert((*collateral_asset).into(), number+1);
            };

            for i in 0..len {
                let underlying = self.supported_assets.at(i).read();
                let symbol = super::IERC20SymbolDispatcher { contract_address: underlying }.symbol();
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
        
        // V2: This is only used for UI purposes.
        fn get_all_positions(
            self: @ContractState, user: ContractAddress, pool_address: ContractAddress
        ) -> Array<(ContractAddress, ContractAddress, PositionWithAmounts)> {
            // Delegate to range-based implementation over full range
            let supported_assets = self.get_supported_assets_array();
            let len = supported_assets.len();
            self.get_all_positions_range(user, pool_address, 0, len)
        }

        // V2: Paginated version to avoid exceeding RPC step limits. Iterates collateral assets in [start_index, end_index).
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
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };

            // Clamp bounds
            let start = if start_index > len { len } else { start_index };
            let end = if end_index > len { len } else { end_index };

            // Iterate through the requested range of collateral assets
            let mut i = start;
            while i != end {
                let collateral_asset = *supported_assets.at(i);

                // V2: Check vtoken balance first (placeholder implementation)
                let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
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

                // V2: Check position with zero debt (earning positions)
                let (position, _, _) = pool_dispatcher
                    .position(collateral_asset, Zero::zero(), user);
                if position.collateral_shares > 0 {
                    let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
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

                // Then check all other possible debt assets
                for j in 0..len {
                    if i == j {
                        continue; // Skip same asset pairs
                    }
                    let debt_asset = *supported_assets.at(j);
                    let (position, _, debt) = pool_dispatcher
                        .position(collateral_asset, debt_asset, user);
                    if position.collateral_shares > 0 || position.nominal_debt > 0 {
                        let vtoken = self.get_vtoken_for_collateral(collateral_asset, pool_address);
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

        // V2: This is only used for UI purposes.
        fn get_asset_price(self: @ContractState, asset: ContractAddress, pool_address: ContractAddress) -> u256 {
            let pool_address = if pool_address == Zero::zero() { self.default_pool.read() } else { pool_address };
            // V2: For now return 0 - this needs proper implementation based on V2 pool structure
            // In V2, pricing may be handled differently
            0
        }

        // V2: This is only used for UI purposes.
        fn get_supported_assets_ui(self: @ContractState, pool_address: ContractAddress) -> Array<TokenMetadata> {
            let mut assets = array![];
            let len = self.supported_assets.len();
            let pool_address = if pool_address == Zero::zero() { self.default_pool.read() } else { pool_address };
            let pool_dispatcher = IPoolDispatcher { contract_address: pool_address };

            for i in 0..len {
                let asset = self.supported_assets.at(i).read();
                let asset_felt: felt252 = asset.into();

                let symbol_felt = super::IERC20SymbolDispatcher { contract_address: asset }.symbol();

                let decimals = IERC20MetadataDispatcher { contract_address: asset }.decimals();

                // V2: Get rate information from the pool
                let rate_accumulator = pool_dispatcher.rate_accumulator(asset);
                let utilization = pool_dispatcher.utilization(asset);
                let (asset_config, _) = pool_dispatcher.asset_config(asset);
                let fee_rate = asset_config.fee_rate; // V2: Use fee_rate directly
                
                // V2: Create a default price structure (needs proper implementation)
                let price = AssetPrice { value: 0, is_valid: false };

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
    }

    // Note: Flash loan receiver could be added later if needed for complex position migrations
    // involving existing debt. For now, we only handle the simple zero-debt case.
}
