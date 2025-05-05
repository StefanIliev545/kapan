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
sleep 3

# Deploy shared CDP
CDP=$(starkli deploy 0x078e647e45d1d01f6af14124f5dcc58fccc3a3c888d97169e321e2fbe5488436 --network sepolia --watch $OWNER u256:1200000000000000000 | tail -n 1)
sleep 3

# Deploy Price Feed
PRICE_FEED=$(starkli deploy 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network sepolia --watch \
  $OWNER | tail -n 1)
sleep 3

# Deploy Mock Price Feeds
MOCK_PRICE_FEED_WBTC=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_WBTC" | tail -n 1)
sleep 3

MOCK_PRICE_FEED_USDC=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_USDC" | tail -n 1)
sleep 3

MOCK_PRICE_FEED_ETH=$(starkli deploy 0x07006e3f32e979cb5b6664080b1f512a6ffa78a118b5233e08f1114c438d2598 --network sepolia --watch \
  "u256:$MOCK_PRICE_ETH" | tail -n 1)
sleep 3

# Deploy WBTC Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_WBTC" "str:n$ASSET_WBTC" \
  $CDP \
  $UNDERLYING_WBTC \
  0 \
  $OWNER
sleep 3

NCOL_WBTC=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Collateral" "str:n$ASSET_WBTC-c" \
  $CDP \
  $UNDERLYING_WBTC \
  1 \
  $OWNER | tail -n 1)
sleep 3

DEBT_ASSET_WBTC=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_WBTC" "str:d$ASSET_WBTC" \
  $CDP \
  $UNDERLYING_WBTC \
  $IRM \
  $OWNER | tail -n 1)
sleep 3

IBC_WBTC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Interest Collat." "str:i$ASSET_WBTC-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_WBTC \
  $OWNER | tail -n 1)
sleep 3

IB_WBTC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_WBTC Interest" "str:i$ASSET_WBTC" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_WBTC \
  $OWNER | tail -n 1)
sleep 3

# Deploy USDC Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_USDC" "str:n$ASSET_USDC" \
  $CDP \
  $UNDERLYING_USDC \
  0 \
  $OWNER
sleep 3

NCOL_USDC=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_USDC Collateral" "str:n$ASSET_USDC-c" \
  $CDP \
  $UNDERLYING_USDC \
  1 \
  $OWNER | tail -n 1)
sleep 3

DEBT_ASSET_USDC=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_USDC" "str:d$ASSET_USDC" \
  $CDP \
  $UNDERLYING_USDC \
  $IRM \
  $OWNER | tail -n 1)
sleep 3

IBC_USDC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_USDC Interest Collat." "str:i$ASSET_USDC-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_USDC \
  $OWNER | tail -n 1)
sleep 3

IB_USDC=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_USDC Interest" "str:i$ASSET_USDC" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_USDC \
  $OWNER | tail -n 1)
sleep 3

# Deploy ETH Assets
starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_ETH" "str:n$ASSET_ETH" \
  $CDP \
  $UNDERLYING_ETH \
  0 \
  $OWNER
sleep 3

NCOL_ETH=$(starkli deploy 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network sepolia --watch \
  "str:Nostra $ASSET_ETH Collateral" "str:n$ASSET_ETH-c" \
  $CDP \
  $UNDERLYING_ETH \
  1 \
  $OWNER | tail -n 1)
sleep 3

DEBT_ASSET_ETH=$(starkli deploy 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network sepolia --watch \
  "str:Debt $ASSET_ETH" "str:d$ASSET_ETH" \
  $CDP \
  $UNDERLYING_ETH \
  $IRM \
  $OWNER | tail -n 1)
sleep 3

IBC_ETH=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_ETH Interest Collat." "str:i$ASSET_ETH-c" \
  $CDP \
  1 \
  $IRM \
  $DEBT_ASSET_ETH \
  $OWNER | tail -n 1)
sleep 3

IB_ETH=$(starkli deploy 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network sepolia --watch \
  "str:Nostra $ASSET_ETH Interest" "str:i$ASSET_ETH" \
  $CDP \
  0 \
  $IRM \
  $DEBT_ASSET_ETH \
  $OWNER | tail -n 1)
sleep 3

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
sleep 3
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_WBTC
sleep 3
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_WBTC "2" $PRICE_FEED u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_WBTC u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_WBTC 0x02 $IBC_WBTC $NCOL_WBTC
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_WBTC $IB_WBTC $IBC_WBTC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER
sleep 3

# Configure USDC
starkli invoke --watch $PRICE_FEED selector:set_main_oracle $MOCK_PRICE_FEED_USDC
sleep 3
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_USDC
sleep 3
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_USDC "2" $PRICE_FEED u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_USDC u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_USDC 0x02 $IBC_USDC $NCOL_USDC
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_USDC $IB_USDC $IBC_USDC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER
sleep 3

# Configure ETH
starkli invoke --watch $PRICE_FEED selector:set_main_oracle $MOCK_PRICE_FEED_ETH
sleep 3
starkli invoke --watch $PRICE_FEED selector:set_fallback_oracle $MOCK_PRICE_FEED_ETH
sleep 3
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_ETH "2" $PRICE_FEED u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_ETH u256:800000000000000000 $PRICE_FEED u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_ETH 0x02 $IBC_ETH $NCOL_ETH
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_ETH $IB_ETH $IBC_ETH u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER

Shared Contracts:
CDP: 0x0169fd6a90eb3cba3a39bb4e2dbf297b8855747c0ebe50d3089d4a70993392c8
IRM: 0x047a2a6ffbbd42713b9aa00c5f489f0a20b92c22188eb8dac64b1fe4901cfa3b
PRICE_FEED: 0x043863d349c8464156d2c0a6220676d065d66d8fb32df031d4e9b50982c3a250
WBTC Contracts:
MOCK_PRICE_FEED_WBTC: 0x01911f5b4941555c56d3facf2ac16fa71b894dd423772d8600293dd1f405577c
NCOL_WBTC: 0x01b436a21c402dab47d28ae52346295dc8a647284a2124196e85db4ed5a65157
DEBT_ASSET_WBTC: 0x03724c7609622b15cf35025c0649c39a6d370f7ede668474c6b7421212d66a65
IBC_WBTC: 0x026299c775870406ba193c0ee5ea74b99de9e489eae0df275f9bb19eef88a0ba
IB_WBTC: 0x06613f2cb9faaa25c182e7ab568243c87aba0b1b7559bd5f4aa105113a313284
USDC Contracts:
MOCK_PRICE_FEED_USDC: 0x07b0bd16c4ed5fc5e1a7f6a5d8375a2aad52663f622110b0b9e3fb9cce707399
NCOL_USDC: 0x021c34dcc27e9be68e0bbeaa555dda28f8c754d0ec70e6e8f916326dc939bd24
DEBT_ASSET_USDC: 0x07b14654648e9ea6d0821343266037f16570188d3d5ef3999b364dd99e7c7061
IBC_USDC: 0x00e7d28fd5ec0921bf682f0638d6b6dc2b9ebc7f41669443bc4d88447d26e732
IB_USDC: 0x0561ec4a00c9e43b704d5deb25454f2ed6c89e5551c8091410695261b9236aff
ETH Contracts:
MOCK_PRICE_FEED_ETH: 0x064eb7aa8cafa87ed1d62d57472c239b8298a9cc07ef00dc44a6e2e6371a1fcf
NCOL_ETH: 0x063bfc57e6d626db7d66c607c2532957fac06d5563cd66e4784791ad0181fd5f
DEBT_ASSET_ETH: 0x01a7112d034129e5f101b36a920806dc94542a56aea8b084a0f81fb2a217f0b1
IBC_ETH: 0x01f3316ef4a582d971900d777b2a0db0ac25614522f14808d8da3db0ff916b30
IB_ETH: 0x0157ebd8c07a6e554ab65f054f21a7714be185ce2ae5825939d8f1c8961e15ce