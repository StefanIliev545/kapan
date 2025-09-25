// Cairo 1.x — ERC4626-compatible Market Making Vault for USDC
// - Accepts USDC and mints vault shares (ERC4626).
// - Market-makes against a single IRSControllerSingle market (two meters).
// - Never pays fixed: vault only opens FIX (receive fixed / pay harvest) positions.
// - Uses ONLY its harvested share inventory to fund its pay-harvest pots (can redeem inventory to USDC to satisfy controller's fund_assets input).
// - Matches users who want VAR (pay fixed / receive harvest) by opening user's VAR on-behalf + a vault FIX counterposition.
//
// Assumed meter mapping for the bound IRS market (edit if yours differs):
//   METER_INDEX_0 = Harvest meter (debit for FIX)
//   METER_INDEX_1 = Time    meter (credit for FIX)
//
// ─────────────────────────────────────────────────────────────────────────────

#[starknet::contract]
mod USDCMMVault4626 {
    use starknet::ContractAddress;
    use core::integer::u256::U256;
    use core::traits::TryInto;

    // ─────────────────────────────────────────────────────────────────────────
    // External interfaces (match your deployed IRS + Adapter ABIs)
    // ─────────────────────────────────────────────────────────────────────────

    #[starknet::interface]
    trait IUSDC<T> {
        fn decimals(self: @T) -> u8;
        fn balance_of(self: @T, owner: ContractAddress) -> u128;
        fn transfer_from(ref self: T, from: ContractAddress, to: ContractAddress, value: u128);
        fn transfer(ref self: T, to: ContractAddress, value: u128);
        fn approve(ref self: T, spender: ContractAddress, value: u128);
    }

    #[starknet::interface]
    trait IShareToken<T> {
        fn balance_of(self: @T, owner: ContractAddress) -> U256;
        fn transfer(ref self: T, to: ContractAddress, amount: U256);
        fn approve(ref self: T, spender: ContractAddress, amount: U256);
    }

    // The same Adapter interface used in the controller
    #[starknet::interface]
    trait I4626Adapter<T> {
        fn asset(self: @T) -> ContractAddress;                          // USDC
        fn shares_token(self: @T) -> ContractAddress;                   // Vault share token (ERC20-like)
        fn total_assets(self: @T) -> u128;
        fn convert_to_shares(self: @T, assets_amount: u128) -> U256;
        fn convert_to_assets(self: @T, shares_amount: U256) -> u128;
        fn pull_deposit_from(ref self: T, payer: ContractAddress, assets_amount: u128, receiver: ContractAddress) -> U256;
        fn payout(ref self: T, to: ContractAddress, shares_amount: U256, redeem_in_assets: bool);
    }

    // Single-market IRS controller interface (subset)
    #[starknet::interface]
    trait IIRSControllerSingle<T> {
        // For vault FIX (receive fixed / pay harvest): credit_meter_index = TIME(1), debit_meter_index = HARVEST(0)
        // For user VAR   (receive harvest / pay fixed): credit_meter_index = HARVEST(0), debit_meter_index = TIME(1)
        fn open_position_on_behalf(
            ref self: T,
            owner_address: ContractAddress,
            credit_meter_index: u8,
            exposure_rate: U256,
            meter0_scalar_q96: U256,   // s for meter 0 (Harvest)
            meter1_scalar_q96: U256,   // s for meter 1 (Time)
            prepay_assets_usdc: u128,
            funding_payer_address: ContractAddress
        ) -> u64;

        fn claim(
            ref self: T,
            pos_id: u64,
            to: ContractAddress,
            in_assets: bool
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Constants / Conventions
    // ─────────────────────────────────────────────────────────────────────────

    const METER_INDEX_HARVEST: u8 = 0;
    const METER_INDEX_TIME: u8 = 1;

    // Q96 ONE (fixed-point) — plug from your math lib
    const Q96_ONE: U256 = U256::from(0x1000000000000000000000000);

    // ─────────────────────────────────────────────────────────────────────────
    // Storage (ERC20 + ERC4626 + MM state)
    // ─────────────────────────────────────────────────────────────────────────

    #[storage]
    struct Storage {
        // ===== ERC20 (vault shares) =====
        name: felt252,
        symbol: felt252,
        decimals: u8,                 // Vault share decimals (recommend 18)
        total_supply: U256,
        balances: LegacyMap<ContractAddress, U256>,
        allowances: LegacyMap<(ContractAddress, ContractAddress), U256>,

        // ===== ERC4626 config =====
        usdc_asset: ContractAddress,              // underlying asset (USDC)
        adapter: ContractAddress,                 // same adapter as IRS market meters
        controller: ContractAddress,              // IRS controller (single market)
        share_token_of_adapter: ContractAddress,  // the ERC20 share token of the adapter's vault (to hold harvest inventory)

        // ===== Vault AUM bookkeeping =====
        // We keep TVL in raw USDC to compute shares <-> assets conversions.
        total_assets_usdc: u128,                  // tracked USDC AUM (principal + realized P&L in assets when realized)

        // ===== Quoting & utilization =====
        utilization_target_bps: u16,      // e.g., 7000 = 70%
        base_spread_bps_per_year: u16,    // e.g., 10 bps/y baseline
        eip1559_tick_bps_per_day: u16,    // nudges spread vs utilization target
        max_spread_bps_per_year: u16,     // cap, e.g., 25 bps/y

        // EMA (anchor) of realized harvest, in assets per (rate·second) as Q96 (matches controller unit)
        ema_harvest_assets_per_rate_per_second_q96: U256,

        // Track vault’s FIX positions (so we can claim / manage)
        next_internal_position_id: u64,
        internal_fix_positions: LegacyMap<u64, u64>,  // local_id -> controller_pos_id
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────────────────────────────────

    #[event] fn Deposit(caller: ContractAddress, receiver: ContractAddress, assets_usdc: u128, shares: U256);
    #[event] fn Withdraw(caller: ContractAddress, receiver: ContractAddress, owner: ContractAddress, assets_usdc: u128, shares: U256);
    #[event] fn MMOpenPayFixed(user: ContractAddress, exposure_rate: U256, meter0_scalar_q96: U256, meter1_scalar_q96: U256, user_controller_pos_id: u64, vault_controller_pos_id: u64);
    #[event] fn InventoryRedeemedToAssets(amount_shares: U256, assets_out_usdc: u128);
    #[event] fn ClaimedToInventory(controller_pos_id: u64, shares_received: U256);
    #[event] fn QuoteParamsUpdated(util_target_bps: u16, base_spread_bps_y: u16, tick_bps_day: u16, max_spread_bps_y: u16);

    // ─────────────────────────────────────────────────────────────────────────
    // Internal math helpers (wire your real Q96 math here)
    // ─────────────────────────────────────────────────────────────────────────
    fn q96_mul(a: U256, b: U256) -> U256 {
        // TODO:  (a * b) >> 96 with overflow checks
        a + b // placeholder
    }
    fn q96_div(a: U256, b: U256) -> U256 {
        // TODO:  (a << 96) / b with overflow checks
        if b == U256::from(0) { U256::from(0) } else { a }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC20 (vault share token) — minimal implementation
    // ─────────────────────────────────────────────────────────────────────────

    #[event] fn Transfer(from: ContractAddress, to: ContractAddress, value: U256);
    #[event] fn Approval(owner: ContractAddress, spender: ContractAddress, value: U256);

    #[external]
    fn name(self: @ContractState) -> felt252 { self.name.read() }

    #[external]
    fn symbol(self: @ContractState) -> felt252 { self.symbol.read() }

    #[external]
    fn decimals(self: @ContractState) -> u8 { self.decimals.read() }

    #[external]
    fn total_supply(self: @ContractState) -> U256 { self.total_supply.read() }

    #[external]
    fn balance_of(self: @ContractState, owner: ContractAddress) -> U256 { self.balances.read(owner) }

    #[external]
    fn allowance(self: @ContractState, owner: ContractAddress, spender: ContractAddress) -> U256 {
        self.allowances.read((owner, spender))
    }

    #[external]
    fn approve(ref self: ContractState, spender: ContractAddress, value: U256) -> bool {
        let owner = starknet::get_caller_address();
        self.allowances.write((owner, spender), value);
        Approval(owner, spender, value);
        true
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC4626 view functions
    // ─────────────────────────────────────────────────────────────────────────

    #[external]
    fn asset(self: @ContractState) -> ContractAddress { self.usdc_asset.read() }

    #[external]
    fn total_assets(self: @ContractState) -> u128 { self.total_assets_usdc.read() }

    fn convert_to_shares_internal(self: @ContractState, assets_usdc: u128) -> U256 {
        let supply = self.total_supply.read();
        let tvl = self.total_assets_usdc.read();
        if supply == U256::from(0) || tvl == 0_u128 {
            return U256::from(assets_usdc);
        }
        U256::from(assets_usdc) * supply / U256::from(tvl)
    }

    fn convert_to_assets_internal(self: @ContractState, shares: U256) -> u128 {
        let supply = self.total_supply.read();
        let tvl = self.total_assets_usdc.read();
        if supply == U256::from(0) {
            return 0_u128;
        }
        let num = shares * U256::from(tvl);
        num.try_into().unwrap_or(0_u128)
    }

    #[external]
    fn preview_deposit(self: @ContractState, assets_usdc: u128) -> U256 { self.convert_to_shares_internal(assets_usdc) }

    #[external]
    fn preview_mint(self: @ContractState, shares: U256) -> u128 { self.convert_to_assets_internal(shares) }

    #[external]
    fn preview_withdraw(self: @ContractState, assets_usdc: u128) -> U256 { self.convert_to_shares_internal(assets_usdc) }

    #[external]
    fn preview_redeem(self: @ContractState, shares: U256) -> u128 { self.convert_to_assets_internal(shares) }

    // ─────────────────────────────────────────────────────────────────────────
    // ERC4626 mutating functions
    // ─────────────────────────────────────────────────────────────────────────

    #[external]
    fn deposit(ref self: ContractState, assets_usdc: u128, receiver: ContractAddress) -> U256 {
        let usdc = self.usdc_asset.read();
        let caller = starknet::get_caller_address();
        IUSDC::transfer_from(ref usdc, caller, starknet::contract_address(), assets_usdc);

        let shares = self.convert_to_shares_internal(assets_usdc);
        let prev = self.balances.read(receiver);
        self.balances.write(receiver, prev + shares);
        self.total_supply.write(self.total_supply.read() + shares);

        self.total_assets_usdc.write(self.total_assets_usdc.read() + assets_usdc);

        Deposit(caller, receiver, assets_usdc, shares);
        shares
    }

    #[external]
    fn mint(ref self: ContractState, shares: U256, receiver: ContractAddress) -> u128 {
        let assets = self.convert_to_assets_internal(shares);
        let usdc = self.usdc_asset.read();
        let caller = starknet::get_caller_address();
        IUSDC::transfer_from(ref usdc, caller, starknet::contract_address(), assets);

        self.balances.write(receiver, self.balances.read(receiver) + shares);
        self.total_supply.write(self.total_supply.read() + shares);
        self.total_assets_usdc.write(self.total_assets_usdc.read() + assets);

        Deposit(caller, receiver, assets, shares);
        assets
    }

    #[external]
    fn withdraw(ref self: ContractState, assets_usdc: u128, receiver: ContractAddress, owner: ContractAddress) -> U256 {
        let shares = self.convert_to_shares_internal(assets_usdc);
        self.burn_from(owner, shares);

        let usdc = self.usdc_asset.read();
        IUSDC::transfer(ref usdc, receiver, assets_usdc);

        self.total_assets_usdc.write(self.total_assets_usdc.read() - assets_usdc);

        Withdraw(starknet::get_caller_address(), receiver, owner, assets_usdc, shares);
        shares
    }

    #[external]
    fn redeem(ref self: ContractState, shares: U256, receiver: ContractAddress, owner: ContractAddress) -> u128 {
        let assets = self.convert_to_assets_internal(shares);
        self.burn_from(owner, shares);

        let usdc = self.usdc_asset.read();
        IUSDC::transfer(ref usdc, receiver, assets);

        self.total_assets_usdc.write(self.total_assets_usdc.read() - assets);

        Withdraw(starknet::get_caller_address(), receiver, owner, assets, shares);
        assets
    }

    fn burn_from(ref self: ContractState, owner: ContractAddress, shares: U256) {
        let caller = starknet::get_caller_address();
        if caller != owner {
            let allowed = self.allowances.read((owner, caller));
            assert(allowed >= shares, 'insufficient allowance');
            self.allowances.write((owner, caller), allowed - shares);
        }
        let bal = self.balances.read(owner);
        assert(bal >= shares, 'insufficient shares');
        self.balances.write(owner, bal - shares);
        self.total_supply.write(self.total_supply.read() - shares);
        let zero_address = ContractAddress::from_felt252(0);
        Transfer(owner, zero_address, shares);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Market making: quoting & matching
    // ─────────────────────────────────────────────────────────────────────────

    fn current_inventory_shares(self: @ContractState) -> U256 {
        let share_token = self.share_token_of_adapter.read();
        IShareToken::balance_of(@share_token, starknet::contract_address())
    }

    #[external]
    fn set_quote_params(
        ref self: ContractState,
        utilization_target_bps: u16,
        base_spread_bps_per_year: u16,
        eip1559_tick_bps_per_day: u16,
        max_spread_bps_per_year: u16
    ) {
        self.utilization_target_bps.write(utilization_target_bps);
        self.base_spread_bps_per_year.write(base_spread_bps_per_year);
        self.eip1559_tick_bps_per_day.write(eip1559_tick_bps_per_day);
        self.max_spread_bps_per_year.write(max_spread_bps_per_year);
        QuoteParamsUpdated(utilization_target_bps, base_spread_bps_per_year, eip1559_tick_bps_per_day, max_spread_bps_per_year);
    }

    #[external]
    fn preview_open_user_pay_fixed(
        self: @ContractState,
        exposure_rate: U256,
        m_user_q96: U256,
        user_prepay_assets_usdc: u128
    ) -> (U256, U256) {
        let adapter = self.adapter.read();
        let funded_fixed_shares = I4626Adapter::convert_to_shares(@adapter, user_prepay_assets_usdc);
        let denom_q96 = q96_mul(exposure_rate, m_user_q96);
        let time_delta_index_q96 = q96_div(funded_fixed_shares, denom_q96);

        let required_harvest_fund_shares = q96_mul(exposure_rate, time_delta_index_q96);
        (time_delta_index_q96, required_harvest_fund_shares)
    }

    #[external]
    fn open_user_pay_fixed_and_vault_fix(
        ref self: ContractState,
        user_address: ContractAddress,
        exposure_rate: U256,
        m_user_q96: U256,
        user_prepay_assets_usdc: u128,
        max_inventory_shares_to_consume: U256
    ) {
        let controller = self.controller.read();
        let adapter = self.adapter.read();
        let share_token = self.share_token_of_adapter.read();

        let user_pos_id = IIRSControllerSingle::open_position_on_behalf(
            ref controller,
            user_address,
            METER_INDEX_HARVEST,
            exposure_rate,
            Q96_ONE,
            m_user_q96,
            user_prepay_assets_usdc,
            user_address
        );

        let funded_fixed_shares = I4626Adapter::convert_to_shares(@adapter, user_prepay_assets_usdc);
        let denom_q96 = q96_mul(exposure_rate, m_user_q96);
        let time_delta_index_q96 = q96_div(funded_fixed_shares, denom_q96);

        let required_harvest_fund_shares = q96_mul(exposure_rate, time_delta_index_q96);
        let current_inventory = IShareToken::balance_of(@share_token, starknet::contract_address());
        assert(current_inventory >= required_harvest_fund_shares, 'insufficient harvest inventory');
        assert(required_harvest_fund_shares <= max_inventory_shares_to_consume, 'inventory slippage');

        I4626Adapter::payout(ref adapter, starknet::contract_address(), required_harvest_fund_shares, true);
        let assets_from_inventory: u128 = I4626Adapter::convert_to_assets(@adapter, required_harvest_fund_shares);
        InventoryRedeemedToAssets(required_harvest_fund_shares, assets_from_inventory);

        let vault_pos_id = IIRSControllerSingle::open_position_on_behalf(
            ref controller,
            starknet::contract_address(),
            METER_INDEX_TIME,
            exposure_rate,
            Q96_ONE,
            m_user_q96,
            assets_from_inventory,
            starknet::contract_address()
        );

        let local_id = self.next_internal_position_id.read();
        self.next_internal_position_id.write(local_id + 1);
        self.internal_fix_positions.write(local_id, vault_pos_id);

        MMOpenPayFixed(user_address, exposure_rate, Q96_ONE, m_user_q96, user_pos_id, vault_pos_id);
    }

    #[external]
    fn claim_vault_fix_to_inventory(ref self: ContractState, local_internal_id: u64) {
        let controller = self.controller.read();
        let pos_id = self.internal_fix_positions.read(local_internal_id);
        assert(pos_id != 0_u64, 'unknown pos');

        IIRSControllerSingle::claim(ref controller, pos_id, starknet::contract_address(), false);

        let share_token = self.share_token_of_adapter.read();
        let bal = IShareToken::balance_of(@share_token, starknet::contract_address());
        ClaimedToInventory(pos_id, bal);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Admin / wiring
    // ─────────────────────────────────────────────────────────────────────────

    #[constructor]
    fn constructor(
        ref self: ContractState,
        name: felt252,
        symbol: felt252,
        decimals: u8,
        usdc_asset: ContractAddress,
        adapter: ContractAddress,
        controller: ContractAddress
    ) {
        self.name.write(name);
        self.symbol.write(symbol);
        self.decimals.write(decimals);
        self.usdc_asset.write(usdc_asset);
        self.adapter.write(adapter);
        self.controller.write(controller);

        let share_token = I4626Adapter::shares_token(@adapter);
        self.share_token_of_adapter.write(share_token);

        self.total_assets_usdc.write(0_u128);
        self.next_internal_position_id.write(1_u64);

        self.utilization_target_bps.write(7000_u16);
        self.base_spread_bps_per_year.write(10_u16);
        self.eip1559_tick_bps_per_day.write(2_u16);
        self.max_spread_bps_per_year.write(25_u16);

        self.ema_harvest_assets_per_rate_per_second_q96.write(U256::from(0));
    }
}
