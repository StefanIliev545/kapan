// Cairo 1.x — Shares-only IRS Controller (meter-agnostic, multi-market)
#[starknet::contract]
mod IRSController {
    use starknet::ContractAddress;
    use core::bool::BoolTrait;
    use core::option::Option;
    use core::integer::u256::U256;

    // -------- Adapter interface (ERC-4626 + edges) --------
    #[starknet::interface]
    trait I4626Adapter<T> {
        fn asset(self: @T) -> ContractAddress;                             // USDC (assets)
        fn shares_token(self: @T) -> ContractAddress;                       // ERC20 for vault shares
        fn total_assets(self: @T) -> u128;                                  // current assets (USDC 6dp)
        fn convert_to_shares(self: @T, assets: u128) -> U256;               // at current PPS
        fn convert_to_assets(self: @T, shares: U256) -> u128;               // at current PPS

        // Pull USDC from 'payer', deposit, and mint shares to 'receiver' (controller)
        fn pull_deposit_from(
            ref self: T, payer: ContractAddress, assets: u128, receiver: ContractAddress
        ) -> U256;

        // Pay out: send 'shares' to 'to' as shares, or redeem to assets and send to 'to'
        fn payout(
            ref self: T, to: ContractAddress, shares: U256, in_assets: bool
        );
    }

    // -------- Types --------
    #[derive(Copy, Drop)]
    enum MeterType { Time: (), Harvest: () }

    // Each market has two meters: M0, M1
    #[derive(Copy, Drop)]
    struct MarketKey { id: u64 }

    #[derive(Copy, Drop)]
    struct PositionKey { id: u64 }

    // -------- Storage --------
    #[storage]
    struct Storage {
        // Markets
        next_market_id: u64,
        // meter config
        m0_type: LegacyMap<u64, u8>,                    // 0=Time, 1=Harvest
        m1_type: LegacyMap<u64, u8>,
        m0_adapter: LegacyMap<u64, ContractAddress>,
        m1_adapter: LegacyMap<u64, ContractAddress>,
        // indices (Q96 shares/rate)
        m0_I_q96: LegacyMap<u64, U256>,
        m1_I_q96: LegacyMap<u64, U256>,
        // tick sizes (Q96)
        m0_tick_q96: LegacyMap<u64, U256>,
        m1_tick_q96: LegacyMap<u64, U256>,
        // quote policy for Time meters: K_ref in assets/(rate⋅sec), Q96
        m0_k_ref_per_sec_q96: LegacyMap<u64, U256>,
        m1_k_ref_per_sec_q96: LegacyMap<u64, U256>,
        // last timestamps for Time meters
        m0_last_ts: LegacyMap<u64, u64>,
        m1_last_ts: LegacyMap<u64, u64>,
        // last assets for Harvest meters (for delta)
        m0_last_assets: LegacyMap<u64, u128>,
        m1_last_assets: LegacyMap<u64, u128>,
        // sums of effective credit rates per meter (Σ r*s_credit), Q96 scaling
        m0_S_credit_q96: LegacyMap<u64, U256>,
        m1_S_credit_q96: LegacyMap<u64, U256>,
        // caps
        max_rate_credit0: LegacyMap<u64, U256>,         // cap on Σ r*s_credit for meter 0
        max_rate_credit1: LegacyMap<u64, U256>,

        // K_ref publisher (can update K_ref); everyone can poke
        publisher: LegacyMap<u64, ContractAddress>,

        // Buckets: per (market, meter, tick) -> head pos
        m0_bucket_head: LegacyMap<(u64, u128), u64>,    // (marketId, tick) -> posId
        m1_bucket_head: LegacyMap<(u64, u128), u64>,
        bucket_next: LegacyMap<u64, u64>,               // posId -> next posId

        // Positions
        next_pos_id: u64,
        pos_market: LegacyMap<u64, u64>,
        pos_owner: LegacyMap<u64, ContractAddress>,
        pos_active: LegacyMap<u64, bool>,
        pos_credit_side: LegacyMap<u64, u8>,            // 0 or 1
        pos_r: LegacyMap<u64, U256>,                    // exposure
        pos_s0_q96: LegacyMap<u64, U256>,               // per-meter multipliers
        pos_s1_q96: LegacyMap<u64, U256>,
        pos_fund_shares: LegacyMap<u64, U256>,          // shares of the **debit** adapter
        pos_ckpt0_q96: LegacyMap<u64, U256>,
        pos_ckpt1_q96: LegacyMap<u64, U256>,
        pos_stop_debit_q96: LegacyMap<u64, U256>,
        pos_net_shares: LegacyMap<u64, U256>,           // claim in **credit** share token (unsigned here)
    }

    // -------- Events --------
    #[event] fn MarketCreated(market_id: u64, m0_type: u8, m1_type: u8, m0_adapter: ContractAddress, m1_adapter: ContractAddress);
    #[event] fn QuoteUpdated(market_id: u64, meter: u8, k_ref_per_sec_q96: U256);
    #[event] fn Open(market_id: u64, pos_id: u64, owner: ContractAddress, credit_side: u8, r: U256, s0_q96: U256, s1_q96: U256, funded: U256);
    #[event] fn TopUp(pos_id: u64, added_shares: U256);
    #[event] fn ChangeRate(pos_id: u64, old_r: U256, new_r: U256);
    #[event] fn Claim(pos_id: u64, to: ContractAddress, paid_shares: U256, in_assets: bool);
    #[event] fn Close(pos_id: u64, refund_shares: U256, paid_net_shares: U256);
    #[event] fn PokeTime(market_id: u64, meter: u8, new_I_q96: U256);
    #[event] fn PokeHarvest(market_id: u64, meter: u8, harvest_shares: U256, new_I_q96: U256);
    #[event] fn Expire(market_id: u64, meter: u8, pos_id: u64);

    // -------- Internal math helpers (sketch) --------
    fn q96_mul(a: U256, b: U256) -> U256 { /* ... */ }
    fn q96_div(a: U256, b: U256) -> U256 { /* ... */ }
    fn ceil_mul_q96(r: U256, s_q96: U256, dx_q96: U256) -> U256 { /* ceil( r * s * dx ) in shares */ }
    fn floor_mul_q96(r: U256, s_q96: U256, dx_q96: U256) -> U256 { /* floor */ }
    fn tick_of(x_q96: U256, tick_q96: U256) -> u128 { /* floor(x / tick) */ }

    // -------- Constructor --------
    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_market_id.write(1);
        self.next_pos_id.write(1);
    }

    // -------- Market creation --------
    #[external]
    fn create_market(
        ref self: ContractState,
        m0_type: u8, m1_type: u8,
        m0_adapter: ContractAddress, m1_adapter: ContractAddress,
        m0_tick_q96: U256, m1_tick_q96: U256,
        publisher: ContractAddress,
        max_rate_credit0: U256, max_rate_credit1: U256
    ) -> u64 {
        assert(m0_type < 2, 'bad m0'); assert(m1_type < 2, 'bad m1');
        let id = self.next_market_id.read();
        self.next_market_id.write(id + 1);

        self.m0_type.write(id, m0_type);
        self.m1_type.write(id, m1_type);
        self.m0_adapter.write(id, m0_adapter);
        self.m1_adapter.write(id, m1_adapter);
        self.m0_tick_q96.write(id, m0_tick_q96);
        self.m1_tick_q96.write(id, m1_tick_q96);
        self.publisher.write(id, publisher);
        self.max_rate_credit0.write(id, max_rate_credit0);
        self.max_rate_credit1.write(id, max_rate_credit1);

        // init indices, sums, last anchors
        self.m0_I_q96.write(id, U256::from(0));
        self.m1_I_q96.write(id, U256::from(0));
        self.m0_S_credit_q96.write(id, U256::from(0));
        self.m1_S_credit_q96.write(id, U256::from(0));
        self.m0_last_ts.write(id, 0_u64);
        self.m1_last_ts.write(id, 0_u64);
        self.m0_last_assets.write(id, 0_u128);
        self.m1_last_assets.write(id, 0_u128);

        MarketCreated(id, m0_type, m1_type, m0_adapter, m1_adapter);
        id
    }

    // -------- Quote policy (publisher only) --------
    #[external]
    fn set_k_ref_per_sec(ref self: ContractState, market_id: u64, meter: u8, k_ref_per_sec_q96: U256) {
        let caller = starknet::get_caller_address();
        assert(self.publisher.read(market_id) == caller, 'not publisher');
        if meter == 0_u8 {
            self.m0_k_ref_per_sec_q96.write(market_id, k_ref_per_sec_q96);
        } else { self.m1_k_ref_per_sec_q96.write(market_id, k_ref_per_sec_q96); }
        QuoteUpdated(market_id, meter, k_ref_per_sec_q96);
    }

    // -------- Open position (on behalf; payer provides USDC approval) --------
    #[external]
    fn open_position_on_behalf(
        ref self: ContractState,
        market_id: u64,
        owner: ContractAddress,
        credit_side: u8,                           // 0 or 1
        r: U256,
        s0_q96: U256, s1_q96: U256,               // e.g., Time m in s_T, Harvest = 1e18 (Q96)
        fund_assets: u128,                         // in USDC (assets)
        payer: ContractAddress
    ) -> u64 {
        assert(credit_side < 2, 'bad side');
        let debit_side: u8 = if credit_side == 0_u8 { 1_u8 } else { 0_u8 };

        // Cap checks: Σ r*s_credit per meter
        let s_credit_q96 = if credit_side == 0_u8 { s0_q96 } else { s1_q96 };
        if credit_side == 0_u8 {
            let new_sum = self.m0_S_credit_q96.read(market_id) + q96_mul(r, s_credit_q96);
            assert(new_sum <= self.max_rate_credit0.read(market_id), 'cap m0');
            self.m0_S_credit_q96.write(market_id, new_sum);
        } else {
            let new_sum = self.m1_S_credit_q96.read(market_id) + q96_mul(r, s_credit_q96);
            assert(new_sum <= self.max_rate_credit1.read(market_id), 'cap m1');
            self.m1_S_credit_q96.write(market_id, new_sum);
        }

        // Pull funding into **debit** adapter as shares
        let debit_adapter = if debit_side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let funded = I4626Adapter::pull_deposit_from(ref debit_adapter, payer, fund_assets, starknet::contract_address());

        // Snap checkpoints
        let ck0 = self.m0_I_q96.read(market_id);
        let ck1 = self.m1_I_q96.read(market_id);
        let s_debit_q96 = if debit_side == 0_u8 { s0_q96 } else { s1_q96 };
        let denom = q96_mul(r, s_debit_q96);
        let add_q96 = q96_div(funded, denom);                  // funded / (r*s_debit)
        let ck_debit = if debit_side == 0_u8 { ck0 } else { ck1 };
        let stop_q96 = ck_debit + add_q96;

        // Store position
        let pos_id = self.next_pos_id.read();
        self.next_pos_id.write(pos_id + 1);
        self.pos_market.write(pos_id, market_id);
        self.pos_owner.write(pos_id, owner);
        self.pos_active.write(pos_id, true);
        self.pos_credit_side.write(pos_id, credit_side);
        self.pos_r.write(pos_id, r);
        self.pos_s0_q96.write(pos_id, s0_q96);
        self.pos_s1_q96.write(pos_id, s1_q96);
        self.pos_fund_shares.write(pos_id, funded);
        self.pos_ckpt0_q96.write(pos_id, ck0);
        self.pos_ckpt1_q96.write(pos_id, ck1);
        self.pos_stop_debit_q96.write(pos_id, stop_q96);
        self.pos_net_shares.write(pos_id, U256::from(0));

        // Bucket by debit meter
        let tick_q96 = if debit_side == 0_u8 { self.m0_tick_q96.read(market_id) } else { self.m1_tick_q96.read(market_id) };
        let tick = tick_of(stop_q96, tick_q96);
        bucket_insert(ref self, market_id, debit_side, tick, pos_id);

        Open(market_id, pos_id, owner, credit_side, r, s0_q96, s1_q96, funded);
        pos_id
    }

    // -------- Pokes --------

    // Permissionless — advances Time meter j (0 or 1) and expires debit=j
    #[external]
    fn poke_time(ref self: ContractState, market_id: u64, meter: u8, now: u64) {
        assert(meter < 2, 'bad meter');
        let m_type = if meter == 0_u8 { self.m0_type.read(market_id) } else { self.m1_type.read(market_id) };
        assert(m_type == 0_u8, 'not a Time meter'); // 0=Time

        let last = if meter == 0_u8 { self.m0_last_ts.read(market_id) } else { self.m1_last_ts.read(market_id) };
        if now <= last { return; }
        let dt = now - last;

        // ΔI = convert_to_shares(K_ref_per_sec * dt)
        let k_q96 = if meter == 0_u8 { self.m0_k_ref_per_sec_q96.read(market_id) } else { self.m1_k_ref_per_sec_q96.read(market_id) };
        let assets_per_rate = q96_mul(k_q96, U256::from(dt.into()));
        let adapter = if meter == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let delta_shares = I4626Adapter::convert_to_shares(@adapter, q96_to_assets(assets_per_rate));
        let add_q96 = q96_from_shares(delta_shares);

        let new_I = if meter == 0_u8 { self.m0_I_q96.read(market_id) + add_q96 } else { self.m1_I_q96.read(market_id) + add_q96 };
        if meter == 0_u8 { self.m0_I_q96.write(market_id, new_I); self.m0_last_ts.write(market_id, now); }
        else { self.m1_I_q96.write(market_id, new_I); self.m1_last_ts.write(market_id, now); }

        // Expire debit=meter up to new_I
        expire_until(ref self, market_id, meter, new_I);

        PokeTime(market_id, meter, new_I);
    }

    // Permissionless — advances Harvest meter j (0 or 1) and expires debit=j first
    #[external]
    fn poke_harvest(ref self: ContractState, market_id: u64, meter: u8) {
        assert(meter < 2, 'bad meter');
        let m_type = if meter == 0_u8 { self.m0_type.read(market_id) } else { self.m1_type.read(market_id) };
        assert(m_type == 1_u8, 'not a Harvest meter'); // 1=Harvest

        // Δassets, harvestShares
        let adapter = if meter == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let last_assets = if meter == 0_u8 { self.m0_last_assets.read(market_id) } else { self.m1_last_assets.read(market_id) };
        let total = I4626Adapter::total_assets(@adapter);
        let delta_assets: u128 = if total > last_assets { total - last_assets } else { 0_u128 };
        if meter == 0_u8 { self.m0_last_assets.write(market_id, total); } else { self.m1_last_assets.write(market_id, total); }
        if delta_assets == 0_u128 { return; }

        let harvest_shares = I4626Adapter::convert_to_shares(@adapter, delta_assets);
        let S_credit = if meter == 0_u8 { self.m0_S_credit_q96.read(market_id) } else { self.m1_S_credit_q96.read(market_id) };
        // candidate index
        let incr_q96 = if S_credit == U256::from(0) { U256::from(0) } else { q96_div(harvest_shares, S_credit) };
        let cand = if meter == 0_u8 { self.m0_I_q96.read(market_id) + incr_q96 } else { self.m1_I_q96.read(market_id) + incr_q96 };

        // 1) expire debit=meter using cand (prevents post-stop harvest)
        expire_until(ref self, market_id, meter, cand);

        // 2) set new index = cand
        if meter == 0_u8 { self.m0_I_q96.write(market_id, cand); } else { self.m1_I_q96.write(market_id, cand); }

        PokeHarvest(market_id, meter, harvest_shares, cand);
    }

    // -------- Claim / TopUp / ChangeRate / Close --------

    #[external]
    fn claim(ref self: ContractState, pos_id: u64, to: ContractAddress, in_assets: bool) {
        settle_position_to_now(ref self, pos_id);
        let net = self.pos_net_shares.read(pos_id);
        if net == U256::from(0) { return; }
        let (credit_adapter, _debit_adapter) = adapters_for_pos(self, pos_id);
        // decrease claim then pay
        self.pos_net_shares.write(pos_id, U256::from(0));
        I4626Adapter::payout(ref credit_adapter, to, net, in_assets);
        Claim(pos_id, to, net, in_assets);
    }

    #[external]
    fn top_up(ref self: ContractState, pos_id: u64, payer: ContractAddress, assets: u128) {
        let active = self.pos_active.read(pos_id);
        assert(active, 'inactive');
        settle_position_to_now(ref self, pos_id);
        let market_id = self.pos_market.read(pos_id);
        let credit_side = self.pos_credit_side.read(pos_id);
        let debit_side: u8 = if credit_side == 0_u8 { 1_u8 } else { 0_u8 };
        let debit_adapter = if debit_side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let added = I4626Adapter::pull_deposit_from(ref debit_adapter, payer, assets, starknet::contract_address());
        let fund = self.pos_fund_shares.read(pos_id) + added;
        self.pos_fund_shares.write(pos_id, fund);

        // recompute stop & re-bucket
        let r = self.pos_r.read(pos_id);
        let s0 = self.pos_s0_q96.read(pos_id);
        let s1 = self.pos_s1_q96.read(pos_id);
        let ck_debit = if debit_side == 0_u8 { self.pos_ckpt0_q96.read(pos_id) } else { self.pos_ckpt1_q96.read(pos_id) };
        let s_debit = if debit_side == 0_u8 { s0 } else { s1 };
        let stop = ck_debit + q96_div(fund, q96_mul(r, s_debit));
        self.pos_stop_debit_q96.write(pos_id, stop);
        reinsert_bucket(ref self, pos_id, market_id, debit_side, stop);
        TopUp(pos_id, added);
    }

    #[external]
    fn change_rate(ref self: ContractState, pos_id: u64, new_r: U256) {
        let active = self.pos_active.read(pos_id);
        assert(active, 'inactive');
        settle_position_to_now(ref self, pos_id);
        let old_r = self.pos_r.read(pos_id);
        self.pos_r.write(pos_id, new_r);

        // update S_credit for the credited meter
        let market_id = self.pos_market.read(pos_id);
        let side = self.pos_credit_side.read(pos_id);
        let s_credit = if side == 0_u8 { self.pos_s0_q96.read(pos_id) } else { self.pos_s1_q96.read(pos_id) };
        if side == 0_u8 {
            let sum = self.m0_S_credit_q96.read(market_id) - q96_mul(old_r, s_credit) + q96_mul(new_r, s_credit);
            self.m0_S_credit_q96.write(market_id, sum);
        } else {
            let sum = self.m1_S_credit_q96.read(market_id) - q96_mul(old_r, s_credit) + q96_mul(new_r, s_credit);
            self.m1_S_credit_q96.write(market_id, sum);
        }

        // recompute stop & re-bucket for the debit side
        let debit_side: u8 = if side == 0_u8 { 1_u8 } else { 0_u8 };
        let s_debit = if debit_side == 0_u8 { self.pos_s0_q96.read(pos_id) } else { self.pos_s1_q96.read(pos_id) };
        let ck_debit = if debit_side == 0_u8 { self.pos_ckpt0_q96.read(pos_id) } else { self.pos_ckpt1_q96.read(pos_id) };
        let fund = self.pos_fund_shares.read(pos_id);
        let stop = ck_debit + q96_div(fund, q96_mul(new_r, s_debit));
        self.pos_stop_debit_q96.write(pos_id, stop);
        reinsert_bucket(ref self, pos_id, market_id, debit_side, stop);

        ChangeRate(pos_id, old_r, new_r);
    }

    #[external]
    fn close(ref self: ContractState, pos_id: u64, to: ContractAddress, in_assets: bool) {
        settle_position_to_now(ref self, pos_id);
        let active = self.pos_active.read(pos_id);
        if !active { return; }

        // refund unused fund_shares (debit token) and pay net_shares (credit token)
        let market_id = self.pos_market.read(pos_id);
        let side = self.pos_credit_side.read(pos_id);
        let debit_side: u8 = if side == 0_u8 { 1_u8 } else { 0_u8 };
        let debit_adapter = if debit_side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let credit_adapter = if side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };

        let refund = self.pos_fund_shares.read(pos_id);
        if refund > U256::from(0) { I4626Adapter::payout(ref debit_adapter, to, refund, in_assets); }
        let net = self.pos_net_shares.read(pos_id);
        if net > U256::from(0) { I4626Adapter::payout(ref credit_adapter, to, net, in_assets); }

        // deactivate, clean sums & buckets
        let r = self.pos_r.read(pos_id);
        let s_credit = if side == 0_u8 { self.pos_s0_q96.read(pos_id) } else { self.pos_s1_q96.read(pos_id) };
        if side == 0_u8 { self.m0_S_credit_q96.write(market_id, self.m0_S_credit_q96.read(market_id) - q96_mul(r, s_credit)); }
        else { self.m1_S_credit_q96.write(market_id, self.m1_S_credit_q96.read(market_id) - q96_mul(r, s_credit)); }
        unlink_from_bucket(ref self, pos_id, market_id, debit_side);

        self.pos_active.write(pos_id, false);
        self.pos_r.write(pos_id, U256::from(0));
        self.pos_fund_shares.write(pos_id, U256::from(0));
        self.pos_net_shares.write(pos_id, U256::from(0));

        Close(pos_id, refund, net);
    }

    // -------- Internals: settle & expiry --------

    fn settle_position_to_now(ref self: ContractState, pos_id: u64) {
        let market_id = self.pos_market.read(pos_id);
        let active = self.pos_active.read(pos_id);
        if !active { return; }

        let side = self.pos_credit_side.read(pos_id);
        let debit_side: u8 = if side == 0_u8 { 1_u8 } else { 0_u8 };
        let r = self.pos_r.read(pos_id);
        let s0 = self.pos_s0_q96.read(pos_id);
        let s1 = self.pos_s1_q96.read(pos_id);

        // Current indices
        let I0 = self.m0_I_q96.read(market_id);
        let I1 = self.m1_I_q96.read(market_id);

        // Credit leg
        let (ck_credit, s_credit, I_credit) = if side == 0_u8 {
            (self.pos_ckpt0_q96.read(pos_id), s0, I0)
        } else { (self.pos_ckpt1_q96.read(pos_id), s1, I1) };
        let d_credit = if I_credit > ck_credit { I_credit - ck_credit } else { U256::from(0) };
        let credit_shares = floor_mul_q96(r, s_credit, d_credit);

        // Debit leg (respect stop)
        let (ck_debit, s_debit, I_debit, stop) = if debit_side == 0_u8 {
            (self.pos_ckpt0_q96.read(pos_id), s0, I0, self.pos_stop_debit_q96.read(pos_id))
        } else {
            (self.pos_ckpt1_q96.read(pos_id), s1, I1, self.pos_stop_debit_q96.read(pos_id))
        };
        let capped = if I_debit > stop { stop } else { I_debit };
        let d_debit = if capped > ck_debit { capped - ck_debit } else { U256::from(0) };
        let debit_shares = ceil_mul_q96(r, s_debit, d_debit);

        // Apply
        if credit_shares > U256::from(0) {
            let net = self.pos_net_shares.read(pos_id) + credit_shares;
            self.pos_net_shares.write(pos_id, net);
        }
        if debit_shares > U256::from(0) {
            let fund = self.pos_fund_shares.read(pos_id);
            let new_fund = if fund > debit_shares { fund - debit_shares } else { U256::from(0) };
            self.pos_fund_shares.write(pos_id, new_fund);
        }

        // Update checkpoints
        if side == 0_u8 { self.pos_ckpt0_q96.write(pos_id, I0); } else { self.pos_ckpt1_q96.write(pos_id, I1); }
        if debit_side == 0_u8 { self.pos_ckpt0_q96.write(pos_id, capped); } else { self.pos_ckpt1_q96.write(pos_id, capped); }

        // If crossed stop => expire
        if I_debit >= stop {
            expire_position_finalize(ref self, pos_id, market_id, debit_side);
        }
    }

    fn expire_until(ref self: ContractState, market_id: u64, meter: u8, up_to_q96: U256) {
        // Iterate crossed ticks only
        let tick_q96 = if meter == 0_u8 { self.m0_tick_q96.read(market_id) } else { self.m1_tick_q96.read(market_id) };
        let mut tick = /* last processed tick for this market/meter, or recompute from state */ tick_of(up_to_q96, tick_q96);
        loop {
            let head = if meter == 0_u8 { self.m0_bucket_head.read((market_id, tick)) } else { self.m1_bucket_head.read((market_id, tick)) };
            if head == 0_u64 { break; }
            // consume linked list at this tick
            let mut cur = head;
            while cur != 0_u64 {
                let next = self.bucket_next.read(cur);
                // settle to cut-off (stop) and finalize
                settle_position_to_cutoff(ref self, cur, up_to_q96, meter);
                cur = next;
            }
            // advance to previous tick; stopping criterion depends on stored current tick pointer (maintain per market if you wish)
            // For brevity, assume we clear this tick and break
            if meter == 0_u8 { self.m0_bucket_head.write((market_id, tick), 0_u64); }
            else { self.m1_bucket_head.write((market_id, tick), 0_u64); }
            break;
        }
    }

    fn settle_position_to_cutoff(ref self: ContractState, pos_id: u64, cutoff_q96: U256, meter: u8) {
        // settle both legs; on debit=meter cap index at 'cutoff_q96'
        let market_id = self.pos_market.read(pos_id);
        let side = self.pos_credit_side.read(pos_id);
        let debit_side: u8 = if side == 0_u8 { 1_u8 } else { 0_u8 };

        // current indices with cap
        let I0 = if meter == 0_u8 { cutoff_q96 } else { self.m0_I_q96.read(market_id) };
        let I1 = if meter == 1_u8 { cutoff_q96 } else { self.m1_I_q96.read(market_id) };

        // Reuse settle logic but using capped I for the debit meter
        // (For brevity, call a variant or inline simplified computation)
        // ...
        // After applying, finalize
        expire_position_finalize(ref self, pos_id, market_id, meter);
    }

    fn expire_position_finalize(ref self: ContractState, pos_id: u64, market_id: u64, debit_side: u8) {
        // Remove from buckets & sums; zero rate; mark inactive
        unlink_from_bucket(ref self, pos_id, market_id, debit_side);

        // remove from credited meter sum
        let credit_side = self.pos_credit_side.read(pos_id);
        let r = self.pos_r.read(pos_id);
        let s_credit = if credit_side == 0_u8 { self.pos_s0_q96.read(pos_id) } else { self.pos_s1_q96.read(pos_id) };
        if credit_side == 0_u8 {
            self.m0_S_credit_q96.write(market_id, self.m0_S_credit_q96.read(market_id) - q96_mul(r, s_credit));
        } else {
            self.m1_S_credit_q96.write(market_id, self.m1_S_credit_q96.read(market_id) - q96_mul(r, s_credit));
        }

        self.pos_active.write(pos_id, false);
        self.pos_r.write(pos_id, U256::from(0));
        Expire(market_id, debit_side, pos_id);
    }

    // -------- Bucket helpers (sketch) --------
    fn bucket_insert(ref self: ContractState, market_id: u64, meter: u8, tick: u128, pos_id: u64) {
        let head = if meter == 0_u8 { self.m0_bucket_head.read((market_id, tick)) } else { self.m1_bucket_head.read((market_id, tick)) };
        self.bucket_next.write(pos_id, head);
        if meter == 0_u8 { self.m0_bucket_head.write((market_id, tick), pos_id); }
        else { self.m1_bucket_head.write((market_id, tick), pos_id); }
    }
    fn reinsert_bucket(ref self: ContractState, pos_id: u64, market_id: u64, meter: u8, stop_q96: U256) {
        unlink_from_bucket(ref self, pos_id, market_id, meter);
        let tick_q96 = if meter == 0_u8 { self.m0_tick_q96.read(market_id) } else { self.m1_tick_q96.read(market_id) };
        let tick = tick_of(stop_q96, tick_q96);
        bucket_insert(ref self, market_id, meter, tick, pos_id);
    }
    fn unlink_from_bucket(ref self: ContractState, pos_id: u64, market_id: u64, meter: u8) {
        // For brevity: maintain a prev pointer or do lazy unlink by flags;
        // production: store (meter,tick) per pos and a doubly-linked list.
    }

    // -------- Small utils --------
    fn adapters_for_pos(self: @ContractState, pos_id: u64) -> (ContractAddress, ContractAddress) {
        let market_id = self.pos_market.read(pos_id);
        let side = self.pos_credit_side.read(pos_id);
        let debit_side: u8 = if side == 0_u8 { 1_u8 } else { 0_u8 };
        let credit_adapter = if side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        let debit_adapter = if debit_side == 0_u8 { self.m0_adapter.read(market_id) } else { self.m1_adapter.read(market_id) };
        (credit_adapter, debit_adapter)
    }

    // --- Placeholder conversions between assets<->Q96 (implement from your lib) ---
    fn q96_from_shares(sh: U256) -> U256 { sh }       // if you model shares in Q96 units 1:1
    fn q96_to_assets(x: U256) -> u128 { /* ... */ 0_u128 }
}
