use crate::irs_controller::state::position::Position;
use crate::irs_controller::types::units::Q96;

pub struct BucketAttachment {
    pub position: Position,
    pub new_head: u64,
}

pub fn attach_position(
    mut position: Position,
    meter_index_for_bucket: u8,
    tick_key: u128,
    current_head: u64,
    position_id: u64,
) -> BucketAttachment {
    position.bucket_meter_index = meter_index_for_bucket;
    position.bucket_tick_key = tick_key;
    position.prev_in_bucket = 0_u64;
    position.next_in_bucket = current_head;
    BucketAttachment { position, new_head: position_id }
}

pub fn detach_position(mut position: Position) -> Position {
    position.bucket_meter_index = 255_u8;
    position.bucket_tick_key = 0_u128;
    position.prev_in_bucket = 0_u64;
    position.next_in_bucket = 0_u64;
    position
}

pub fn compute_tick_key(_index_q96: Q96, _tick_size_q96: Q96) -> u128 {
    0_u128
}
