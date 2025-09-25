#[starknet::contract]
mod IRSControllerSingle {
    use core::integer::u256::U256;
    use starknet::storage::{
        LegacyMap, LegacyMapReadAccess, LegacyMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{contract_address, get_caller_address, ContractAddress};

    use crate::irs_controller::adapters::erc4626_adapter::{
        I4626AdapterDispatcher, I4626AdapterDispatcherTrait,
    };
    use crate::irs_controller::logic::openings;
    use crate::irs_controller::math::q96;
    use crate::irs_controller::state::buckets;
    use crate::irs_controller::state::position::Position;
    use crate::irs_controller::types::units::{Q96, Shares};

    #[storage]
    struct Storage {
        meter_type_by_index: LegacyMap<u8, u8>,
        adapter_address_by_meter_index: LegacyMap<u8, ContractAddress>,
        index_shares_per_rate_q96_by_meter_index: LegacyMap<u8, Q96>,
        tick_size_q96_by_meter_index: LegacyMap<u8, Q96>,
        k_ref_assets_per_rate_per_second_q96_by_meter_index: LegacyMap<u8, Q96>,
        last_time_seconds_by_meter_index: LegacyMap<u8, u64>,
        last_total_assets_usdc_by_meter_index: LegacyMap<u8, u128>,
        sum_effective_credit_rate_q96_by_meter_index: LegacyMap<u8, Q96>,
        max_sum_effective_credit_rate_q96_by_meter_index: LegacyMap<u8, Q96>,
        quote_publisher_address: ContractAddress,
        next_position_id: u64,
        positions_by_id: LegacyMap<u64, Position>,
        bucket_head_position_id_by_meter_index_and_tick: LegacyMap<(u8, u128), u64>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PositionOpened: PositionOpened,
    }

    #[derive(Drop, starknet::Event)]
    struct PositionOpened {
        #[key]
        position_id: u64,
        owner: ContractAddress,
        credit_meter: u8,
        funded_shares: U256,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.next_position_id.write(1_u64);
        self.quote_publisher_address.write(ContractAddress::from(0_u128));
    }

    #[external]
    fn configure_market(
        ref self: ContractState,
        meter0_type: u8,
        meter1_type: u8,
        meter0_adapter: ContractAddress,
        meter1_adapter: ContractAddress,
        tick0_q96: Q96,
        tick1_q96: Q96,
        max_sum0_q96: Q96,
        max_sum1_q96: Q96,
        quote_publisher_address: ContractAddress,
    ) {
        self.meter_type_by_index.write(0_u8, meter0_type);
        self.meter_type_by_index.write(1_u8, meter1_type);
        self.adapter_address_by_meter_index.write(0_u8, meter0_adapter);
        self.adapter_address_by_meter_index.write(1_u8, meter1_adapter);
        self.tick_size_q96_by_meter_index.write(0_u8, tick0_q96);
        self.tick_size_q96_by_meter_index.write(1_u8, tick1_q96);
        self.max_sum_effective_credit_rate_q96_by_meter_index
            .write(0_u8, max_sum0_q96);
        self.max_sum_effective_credit_rate_q96_by_meter_index
            .write(1_u8, max_sum1_q96);
        self.index_shares_per_rate_q96_by_meter_index
            .write(0_u8, Q96(U256::from(0)));
        self.index_shares_per_rate_q96_by_meter_index
            .write(1_u8, Q96(U256::from(0)));
        self.sum_effective_credit_rate_q96_by_meter_index
            .write(0_u8, Q96(U256::from(0)));
        self.sum_effective_credit_rate_q96_by_meter_index
            .write(1_u8, Q96(U256::from(0)));
        self.quote_publisher_address.write(quote_publisher_address);
    }

    #[external]
    fn set_k_ref_per_sec(
        ref self: ContractState,
        meter_index: u8,
        k_ref_per_sec_q96: Q96,
    ) {
        let caller = get_caller_address();
        assert(caller == self.quote_publisher_address.read(), 'not publisher');
        self.k_ref_assets_per_rate_per_second_q96_by_meter_index
            .write(meter_index, k_ref_per_sec_q96);
    }

    #[external]
    fn open_position_on_behalf(
        ref self: ContractState,
        owner_address: ContractAddress,
        credit_meter_index: u8,
        exposure_rate: U256,
        meter0_scalar_q96: Q96,
        meter1_scalar_q96: Q96,
        prepay_assets_usdc: u128,
        funding_payer_address: ContractAddress,
    ) -> u64 {
        let debit_meter_index = if credit_meter_index == 0_u8 { 1_u8 } else { 0_u8 };

        let scalar_for_credit = if credit_meter_index == 0_u8 {
            meter0_scalar_q96
        } else {
            meter1_scalar_q96
        };
        let current_sum = self
            .sum_effective_credit_rate_q96_by_meter_index
            .read(credit_meter_index);
        let updated_sum = q96::add_q96(current_sum, scalar_for_credit);
        let max_sum = self
            .max_sum_effective_credit_rate_q96_by_meter_index
            .read(credit_meter_index);
        assert(updated_sum.0 <= max_sum.0, 'cap exceeded');
        self.sum_effective_credit_rate_q96_by_meter_index
            .write(credit_meter_index, updated_sum);

        let debit_adapter_address = self
            .adapter_address_by_meter_index
            .read(debit_meter_index);
        let funded_shares_raw = I4626AdapterDispatcher {
            contract_address: debit_adapter_address,
        }
        .pull_deposit_from(
            funding_payer_address,
            prepay_assets_usdc,
            contract_address(),
        );
        let funded_shares = Shares(funded_shares_raw);

        let ckpt0 = self
            .index_shares_per_rate_q96_by_meter_index
            .read(0_u8);
        let ckpt1 = self
            .index_shares_per_rate_q96_by_meter_index
            .read(1_u8);
        let debit_checkpoint = if debit_meter_index == 0_u8 { ckpt0 } else { ckpt1 };
        let scalar_for_debit = if debit_meter_index == 0_u8 {
            meter0_scalar_q96
        } else {
            meter1_scalar_q96
        };
        let stop_index = openings::compute_stop_index_on_debit_meter(
            debit_checkpoint,
            funded_shares,
            exposure_rate,
            scalar_for_debit,
        );

        let position_id = self.next_position_id.read();
        self.next_position_id.write(position_id + 1_u64);
        let new_position = Position::new(
            owner_address,
            credit_meter_index,
            exposure_rate,
            meter0_scalar_q96,
            meter1_scalar_q96,
            funded_shares,
            ckpt0,
            ckpt1,
            stop_index,
        );

        let tick_size = self
            .tick_size_q96_by_meter_index
            .read(debit_meter_index);
        let tick_key = buckets::compute_tick_key(stop_index, tick_size);
        let current_head = self
            .bucket_head_position_id_by_meter_index_and_tick
            .read((debit_meter_index, tick_key));
        let attachment = buckets::attach_position(
            new_position,
            debit_meter_index,
            tick_key,
            current_head,
            position_id,
        );
        self.positions_by_id
            .write(position_id, attachment.position);
        self.bucket_head_position_id_by_meter_index_and_tick
            .write((debit_meter_index, tick_key), attachment.new_head);

        PositionOpened {
            position_id,
            owner: owner_address,
            credit_meter: credit_meter_index,
            funded_shares: funded_shares_raw,
        };

        position_id
    }
}
