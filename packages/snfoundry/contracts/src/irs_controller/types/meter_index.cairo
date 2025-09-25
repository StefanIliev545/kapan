mod meter_index {
    #[derive(Copy, Drop, Serde, PartialEq, Eq)]
    pub enum MeterIndex {
        M0: (),
        M1: (),
    }

    pub fn other(value: MeterIndex) -> MeterIndex {
        match value {
            MeterIndex::M0(()) => MeterIndex::M1(()),
            MeterIndex::M1(()) => MeterIndex::M0(()),
        }
    }

    pub fn from_u8(value: u8) -> MeterIndex {
        match value {
            0_u8 => MeterIndex::M0(()),
            _ => MeterIndex::M1(()),
        }
    }

    pub fn to_u8(value: MeterIndex) -> u8 {
        match value {
            MeterIndex::M0(()) => 0_u8,
            MeterIndex::M1(()) => 1_u8,
        }
    }
}
