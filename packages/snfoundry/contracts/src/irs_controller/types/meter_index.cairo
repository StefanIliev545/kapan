#[derive(Copy, Drop, Serde, PartialEq)]
pub enum MeterIndex {
    M0: (),
    M1: (),
}

pub fn opposite(index: MeterIndex) -> MeterIndex {
    match index {
        MeterIndex::M0(()) => MeterIndex::M1(()),
        MeterIndex::M1(()) => MeterIndex::M0(()),
    }
}
