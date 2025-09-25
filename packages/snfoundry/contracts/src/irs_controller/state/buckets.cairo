#[derive(Copy, Drop, Serde)]
pub struct BucketEntry {
    pub position_id: u64,
    pub meter: u8,
}

pub fn attach(position_id: u64, meter: u8) -> BucketEntry {
    BucketEntry { position_id, meter }
}
