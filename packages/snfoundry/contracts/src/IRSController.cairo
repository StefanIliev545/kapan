use starknet::ContractAddress;

#[starknet::interface]
pub trait IRSControllerTrait<TContractState> {
    fn create_market(
        ref self: TContractState,
        m0_type: u8,
        m1_type: u8,
        m0_adapter: ContractAddress,
        m1_adapter: ContractAddress,
        publisher: ContractAddress,
    ) -> u64;
    fn set_k_ref_per_sec(
        ref self: TContractState, market_id: u64, meter: u8, k_ref_per_sec_q96: u128,
    );
    fn open_position_on_behalf(
        ref self: TContractState,
        market_id: u64,
        owner: ContractAddress,
        credit_side: u8,
        r: u128,
        s0_q96: u128,
        s1_q96: u128,
        fund_assets: u128,
        payer: ContractAddress,
    ) -> u64;
    fn poke_time(ref self: TContractState, market_id: u64, meter: u8, now: u64);
    fn poke_harvest(ref self: TContractState, market_id: u64, meter: u8);
    fn claim(ref self: TContractState, pos_id: u64, to: ContractAddress, in_assets: bool);
    fn top_up(ref self: TContractState, pos_id: u64, payer: ContractAddress, assets: u128);
    fn change_rate(ref self: TContractState, pos_id: u64, new_r: u128);
    fn close(ref self: TContractState, pos_id: u64, to: ContractAddress, in_assets: bool);
}

#[starknet::contract]
mod IRSController {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};
    use super::IRSControllerTrait;

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MarketCreated: MarketCreated,
        QuoteUpdated: QuoteUpdated,
        PositionOpened: PositionOpened,
        PositionToppedUp: PositionToppedUp,
        PositionRateChanged: PositionRateChanged,
        PositionClaimed: PositionClaimed,
        PositionClosed: PositionClosed,
        TimeMeterPoked: TimeMeterPoked,
        HarvestMeterPoked: HarvestMeterPoked,
    }

    #[derive(Drop, starknet::Event)]
    struct MarketCreated {
        #[key]
        market_id: u64,
        m0_type: u8,
        m1_type: u8,
        m0_adapter: ContractAddress,
        m1_adapter: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct QuoteUpdated {
        #[key]
        market_id: u64,
        meter: u8,
        k_ref_per_sec_q96: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionOpened {
        #[key]
        market_id: u64,
        #[key]
        pos_id: u64,
        owner: ContractAddress,
        credit_side: u8,
        r: u128,
        s0_q96: u128,
        s1_q96: u128,
        funded: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionToppedUp {
        #[key]
        pos_id: u64,
        added_shares: u128,
        new_total: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionRateChanged {
        #[key]
        pos_id: u64,
        old_r: u128,
        new_r: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionClaimed {
        #[key]
        pos_id: u64,
        to: ContractAddress,
        claimed_shares: u128,
        in_assets: bool,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionClosed {
        #[key]
        pos_id: u64,
        refund_shares: u128,
        paid_net_shares: u128,
    }

    #[derive(Drop, starknet::Event)]
    struct TimeMeterPoked {
        #[key]
        market_id: u64,
        meter: u8,
        new_timestamp: u64,
    }

    #[derive(Drop, starknet::Event)]
    struct HarvestMeterPoked {
        #[key]
        market_id: u64,
        meter: u8,
        observed_assets: u128,
    }

    #[storage]
    struct Storage {
        next_market_id: u64,
        next_position_id: u64,
        m0_type: Map<u64, u8>,
        m1_type: Map<u64, u8>,
        m0_adapter: Map<u64, ContractAddress>,
        m1_adapter: Map<u64, ContractAddress>,
        publisher: Map<u64, ContractAddress>,
        m0_k_ref_per_sec_q96: Map<u64, u128>,
        m1_k_ref_per_sec_q96: Map<u64, u128>,
        m0_last_ts: Map<u64, u64>,
        m1_last_ts: Map<u64, u64>,
        m0_last_assets: Map<u64, u128>,
        m1_last_assets: Map<u64, u128>,
        pos_market: Map<u64, u64>,
        pos_owner: Map<u64, ContractAddress>,
        pos_active: Map<u64, bool>,
        pos_credit_side: Map<u64, u8>,
        pos_r: Map<u64, u128>,
        pos_s0_q96: Map<u64, u128>,
        pos_s1_q96: Map<u64, u128>,
        pos_fund_shares: Map<u64, u128>,
        pos_net_shares: Map<u64, u128>,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_market_id.write(1);
        self.next_position_id.write(1);
    }

    #[abi(embed_v0)]
    impl IRSControllerImpl of IRSControllerTrait<ContractState> {
        fn create_market(
            ref self: ContractState,
            m0_type: u8,
            m1_type: u8,
            m0_adapter: ContractAddress,
            m1_adapter: ContractAddress,
            publisher: ContractAddress,
        ) -> u64 {
            assert(m0_type < 2, 'invalid m0 type');
            assert(m1_type < 2, 'invalid m1 type');

            let market_id = self.next_market_id.read();
            self.next_market_id.write(market_id + 1);

            self.m0_type.write(market_id, m0_type);
            self.m1_type.write(market_id, m1_type);
            self.m0_adapter.write(market_id, m0_adapter);
            self.m1_adapter.write(market_id, m1_adapter);
            self.publisher.write(market_id, publisher);
            self.m0_k_ref_per_sec_q96.write(market_id, 0);
            self.m1_k_ref_per_sec_q96.write(market_id, 0);
            self.m0_last_ts.write(market_id, 0);
            self.m1_last_ts.write(market_id, 0);
            self.m0_last_assets.write(market_id, 0);
            self.m1_last_assets.write(market_id, 0);

            self.emit(MarketCreated { market_id, m0_type, m1_type, m0_adapter, m1_adapter });
            market_id
        }

        fn set_k_ref_per_sec(
            ref self: ContractState, market_id: u64, meter: u8, k_ref_per_sec_q96: u128,
        ) {
            assert(meter < 2, 'invalid meter');
            assert(self.publisher.read(market_id) == get_caller_address(), 'not publisher');

            if meter == 0 {
                self.m0_k_ref_per_sec_q96.write(market_id, k_ref_per_sec_q96);
            } else {
                self.m1_k_ref_per_sec_q96.write(market_id, k_ref_per_sec_q96);
            }

            self.emit(QuoteUpdated { market_id, meter, k_ref_per_sec_q96 });
        }

        fn open_position_on_behalf(
            ref self: ContractState,
            market_id: u64,
            owner: ContractAddress,
            credit_side: u8,
            r: u128,
            s0_q96: u128,
            s1_q96: u128,
            fund_assets: u128,
            payer: ContractAddress,
        ) -> u64 {
            assert(credit_side < 2, 'invalid credit side');
            let _ = payer;
            let pos_id = self.next_position_id.read();
            self.next_position_id.write(pos_id + 1);

            self.pos_market.write(pos_id, market_id);
            self.pos_owner.write(pos_id, owner);
            self.pos_active.write(pos_id, true);
            self.pos_credit_side.write(pos_id, credit_side);
            self.pos_r.write(pos_id, r);
            self.pos_s0_q96.write(pos_id, s0_q96);
            self.pos_s1_q96.write(pos_id, s1_q96);
            self.pos_fund_shares.write(pos_id, fund_assets);
            self.pos_net_shares.write(pos_id, 0);

            self
                .emit(
                    PositionOpened {
                        market_id,
                        pos_id,
                        owner,
                        credit_side,
                        r,
                        s0_q96,
                        s1_q96,
                        funded: fund_assets,
                    },
                );
            pos_id
        }

        fn poke_time(ref self: ContractState, market_id: u64, meter: u8, now: u64) {
            assert(meter < 2, 'invalid meter');
            if meter == 0 {
                let last = self.m0_last_ts.read(market_id);
                if now > last {
                    self.m0_last_ts.write(market_id, now);
                }
            } else {
                let last = self.m1_last_ts.read(market_id);
                if now > last {
                    self.m1_last_ts.write(market_id, now);
                }
            }

            self.emit(TimeMeterPoked { market_id, meter, new_timestamp: now });
        }

        fn poke_harvest(ref self: ContractState, market_id: u64, meter: u8) {
            assert(meter < 2, 'invalid meter');
            let observed = if meter == 0 {
                let last = self.m0_last_assets.read(market_id);
                self.m0_last_assets.write(market_id, last);
                last
            } else {
                let last = self.m1_last_assets.read(market_id);
                self.m1_last_assets.write(market_id, last);
                last
            };

            self.emit(HarvestMeterPoked { market_id, meter, observed_assets: observed });
        }

        fn claim(ref self: ContractState, pos_id: u64, to: ContractAddress, in_assets: bool) {
            let net = self.pos_net_shares.read(pos_id);
            if net == 0 {
                return;
            }
            self.pos_net_shares.write(pos_id, 0);
            self.emit(PositionClaimed { pos_id, to, claimed_shares: net, in_assets });
        }

        fn top_up(ref self: ContractState, pos_id: u64, payer: ContractAddress, assets: u128) {
            assert(self.pos_active.read(pos_id), 'inactive');
            let _ = payer;
            let current = self.pos_fund_shares.read(pos_id);
            let new_total = current + assets;
            self.pos_fund_shares.write(pos_id, new_total);
            self.emit(PositionToppedUp { pos_id, added_shares: assets, new_total });
        }

        fn change_rate(ref self: ContractState, pos_id: u64, new_r: u128) {
            assert(self.pos_active.read(pos_id), 'inactive');
            let old_r = self.pos_r.read(pos_id);
            self.pos_r.write(pos_id, new_r);
            self.emit(PositionRateChanged { pos_id, old_r, new_r });
        }

        fn close(ref self: ContractState, pos_id: u64, to: ContractAddress, in_assets: bool) {
            if !self.pos_active.read(pos_id) {
                return;
            }
            let _ = to;
            let _ = in_assets;
            let refund = self.pos_fund_shares.read(pos_id);
            let net = self.pos_net_shares.read(pos_id);
            self.pos_active.write(pos_id, false);
            self.pos_fund_shares.write(pos_id, 0);
            self.pos_net_shares.write(pos_id, 0);
            self.emit(PositionClosed { pos_id, refund_shares: refund, paid_net_shares: net });
        }
    }
}
