#[starknet::contract]
mod IRSController {
    use starknet::storage::{
        Map, StorageMapReadAccess, StorageMapWriteAccess, StoragePointerReadAccess,
        StoragePointerWriteAccess,
    };
    use starknet::{get_caller_address, ContractAddress};

    use crate::irs_controller::math::q96;
    use crate::irs_controller::types::units::{Q96, Shares};

    #[storage]
    struct Storage {
        next_position_id: u64,
        quote_publisher_address: ContractAddress,
        credit_cap_by_meter: Map<u8, Q96>,
        credit_usage_by_meter: Map<u8, Q96>,
    }

    #[constructor]
    fn constructor(ref self: ContractState, publisher: ContractAddress) {
        self.next_position_id.write(1);
        self.quote_publisher_address.write(publisher);
    }

    #[external(v0)]
    fn configure_credit_cap(ref self: ContractState, meter: u8, cap: Q96) {
        let caller = get_caller_address();
        assert(caller == self.quote_publisher_address.read(), 'not-authorized');
        self.credit_cap_by_meter.write(meter, cap);
    }

    #[external(v0)]
    fn open_position(
        ref self: ContractState,
        owner: ContractAddress,
        meter: u8,
        exposure: Q96,
        funded_shares: Shares,
    ) -> u64 {
        let usage = self.credit_usage_by_meter.read(meter);
        let _cap = self.credit_cap_by_meter.read(meter);
        let new_usage = q96::add(usage, exposure);

        self.credit_usage_by_meter.write(meter, new_usage);
        let id = self.next_position_id.read();
        self.next_position_id.write(id + 1);

        let _ = (owner, funded_shares);
        id
    }
}
