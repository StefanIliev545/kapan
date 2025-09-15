pub mod interfaces {
    pub mod IGateway;
    pub mod vesu;
    pub mod vesu_data;
    pub mod nostra;
}
pub mod gateways {
    pub mod vesu_gateway;
    pub mod NostraGateway;
    pub mod RouterGateway;
    pub mod ekubo_gateway;
    pub mod avnu_gateway;
}

pub mod utils {
    pub mod optimal_interest_rate_finder;
    pub mod ui_helper;
}

pub mod pricefeed {
    pub mod mock_feed;
}
