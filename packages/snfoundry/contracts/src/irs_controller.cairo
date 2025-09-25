pub mod controller;
pub mod adapters {
    pub mod erc4626_adapter;
}
pub mod logic {
    pub mod openings;
    pub mod settlement;
}
pub mod math {
    pub mod q96;
}
pub mod state {
    pub mod buckets;
    pub mod meters;
    pub mod position;
}
pub mod types {
    pub mod meter_index;
    pub mod units;
}
