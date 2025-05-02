export STARKNET_KEYSTORE="/workspaces/kapan/packages/snfoundry/account/keystore"
export STARKNET_ACCOUNT="/workspaces/kapan/packages/snfoundry/account/account.json"

ETH=0x7bb0505dde7c05f576a6e08e64dadccd7797f14704763a5ad955727be25e5e9
ETH_PRICE=1000000000000000000

# Shared Configuration
CDP=0x05603937457b86ca178b4c64d86401ffc26072108d4824b3013b1c02190025dd
IRM=0x078c79e6cafb98cb46aa05e5dc79b354d0d05fb0989c4771cca0628175ed9745
OWNER=0x02b21e292b00a2a431785474a1a9f61f491fbb2c64068b23d7d1775c261ceb89

# WBTC Configuration
UNDERLYING_WBTC=0xabbd6f1e590eb83addd87ba5ac27960d859b1f17d11a3c1cd6a0006704b141
ASSET_WBTC="WBTC"
MOCK_PRICE_WBTC=52901247964424836682

# USDC Configuration
UNDERLYING_USDC=0x715649d4c493ca350743e43915b88d2e6838b1c78ddc23d6d9385446b9d6844
ASSET_USDC="USDC"
MOCK_PRICE_USDC=544543776397676

# ETH Configuration
UNDERLYING_ETH=$ETH
ASSET_ETH="ETH"
MOCK_PRICE_ETH=$ETH_PRICE

# Deploy shared IRM
IRM=$(starkli deploy 0x03a4008a3e868c3545b61a38b054f054c22a9c8f242eeeaa536c7d9c2226694b --network sepolia --watch $OWNER | tail -n 1)

# Deploy shared CDP
CDP=$(starkli deploy 0x078e647e45d1d01f6af14124f5dcc58fccc3a3c888d97169e321e2fbe5488436 --network sepolia --watch $OWNER u256:1200000000000000000 | tail -n 1)

# Deploy Price Feed
PRICE_FEED=$(starkli deploy 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network sepolia --watch \
  $OWNER | tail -n 1)

# Deploy Mock Price Feeds
MOCK_PRICE_FEED_WBTC=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_WBTC" | tail -n 1)

MOCK_PRICE_FEED_USDC=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_USDC" | tail -n 1)

MOCK_PRICE_FEED_ETH=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_ETH" | tail -n 1)

# Deploy WBTC Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_WBTC" "str:n$ASSET_WBTC" \
  $CDP \
  $UNDERLYING_WBTC \
  0 \
  $OWNER

NCOL_WBTC=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Collateral" "str:n$ASSET_WBTC-c" \
  $CDP \
  $UNDERLYING_WBTC \
  1 \
  $OWNER | tail -n 1)

DEBT_ASSET_WBTC=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_WBTC" "str:d$ASSET_WBTC" \
  $CDP \
  $UNDERLYING_WBTC \
  $IRM \
  $OWNER | tail -n 1)

IBC_WBTC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Interest Collat." "str:i$ASSET_WBTC-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_WBTC \
  $OWNER | tail -n 1)

IB_WBTC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Interest" "str:i$ASSET_WBTC" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_WBTC \
  $OWNER | tail -n 1)

# Deploy USDC Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_USDC" "str:n$ASSET_USDC" \
  $CDP \
  $UNDERLYING_USDC \
  0 \
  $OWNER

NCOL_USDC=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_USDC Collateral" "str:n$ASSET_USDC-c" \
  $CDP \
  $UNDERLYING_USDC \
  1 \
  $OWNER | tail -n 1)

DEBT_ASSET_USDC=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_USDC" "str:d$ASSET_USDC" \
  $CDP \
  $UNDERLYING_USDC \
  $IRM \
  $OWNER | tail -n 1)

IBC_USDC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_USDC Interest Collat." "str:i$ASSET_USDC-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_USDC \
  $OWNER | tail -n 1)

IB_USDC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_USDC Interest" "str:i$ASSET_USDC" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_USDC \
  $OWNER | tail -n 1)

# Deploy ETH Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_ETH" "str:n$ASSET_ETH" \
  $CDP \
  $UNDERLYING_ETH \
  0 \
  $OWNER

NCOL_ETH=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_ETH Collateral" "str:n$ASSET_ETH-c" \
  $CDP \
  $UNDERLYING_ETH \
  1 \
  $OWNER | tail -n 1)

DEBT_ASSET_ETH=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_ETH" "str:d$ASSET_ETH" \
  $CDP \
  $UNDERLYING_ETH \
  $IRM \
  $OWNER | tail -n 1)

IBC_ETH=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_ETH Interest Collat." "str:i$ASSET_ETH-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_ETH \
  $OWNER | tail -n 1)

IB_ETH=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_ETH Interest" "str:i$ASSET_ETH" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_ETH \
  $OWNER | tail -n 1)

echo "Deployed contracts:"
echo "Shared Contracts:"
echo "CDP: $CDP"
echo "IRM: $IRM"
echo "PRICE_FEED: $PRICE_FEED"

echo "WBTC Contracts:"
echo "MOCK_PRICE_FEED_WBTC: $MOCK_PRICE_FEED_WBTC"
echo "NCOL_WBTC: $NCOL_WBTC"
echo "DEBT_ASSET_WBTC: $DEBT_ASSET_WBTC"
echo "IBC_WBTC: $IBC_WBTC"
echo "IB_WBTC: $IB_WBTC"

echo "USDC Contracts:"
echo "MOCK_PRICE_FEED_USDC: $MOCK_PRICE_FEED_USDC"
echo "NCOL_USDC: $NCOL_USDC"
echo "DEBT_ASSET_USDC: $DEBT_ASSET_USDC"
echo "IBC_USDC: $IBC_USDC"
echo "IB_USDC: $IB_USDC"

echo "ETH Contracts:"
echo "MOCK_PRICE_FEED_ETH: $MOCK_PRICE_FEED_ETH"
echo "NCOL_ETH: $NCOL_ETH"
echo "DEBT_ASSET_ETH: $DEBT_ASSET_ETH"
echo "IBC_ETH: $IBC_ETH"
echo "IB_ETH: $IB_ETH"

# Configure WBTC
starkli invoke --watch $PRICE_FEED selector:set_main_oracle $MOCK_PRICE_FEED_WBTC
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_WBTC
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_WBTC "2" $PRICE_FEED u256:900000000000000000
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_WBTC u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_WBTC 0x02 $IBC_WBTC $NCOL_WBTC
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_WBTC $IB_WBTC $IBC_WBTC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER

# Configure USDC
starkli invoke --watch $PRICE_FEED selector:set_main_oracle $MOCK_PRICE_FEED_USDC
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_USDC
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_USDC "2" $PRICE_FEED u256:900000000000000000
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_USDC u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_USDC 0x02 $IBC_USDC $NCOL_USDC
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_USDC $IB_USDC $IBC_USDC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER

# Configure ETH
starkli invoke --watch $PRICE_FEED selector:set_main_oracle $MOCK_PRICE_FEED_ETH
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_ETH
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_ETH "2" $PRICE_FEED u256:900000000000000000
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_ETH u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_ETH 0x02 $IBC_ETH $NCOL_ETH
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_ETH $IB_ETH $IBC_ETH u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER