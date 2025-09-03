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
PRICE_FEED_WBTC=$(starkli deploy 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network sepolia --watch \
  $OWNER | tail -n 1)
sleep 3

PRICE_FEED_USDC=$(starkli deploy 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network sepolia --watch \
  $OWNER | tail -n 1)
sleep 3

PRICE_FEED_ETH=$(starkli deploy 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network sepolia --watch \
  $OWNER | tail -n 1)
sleep 3

# Deploy Mock Price Feeds
MOCK_PRICE_FEED_WBTC=$(starkli deploy 0x03286f21b84f30a52bca03d12f17443fc61a05109b55eeca2f8709176aa94abf --network sepolia --watch \
  "u256:$MOCK_PRICE_WBTC" | tail -n 1)
sleep 3

MOCK_PRICE_FEED_USDC=$(starkli deploy 0x03286f21b84f30a52bca03d12f17443fc61a05109b55eeca2f8709176aa94abf --network sepolia --watch \
  "u256:$MOCK_PRICE_USDC" | tail -n 1)
sleep 3

MOCK_PRICE_FEED_ETH=$(starkli deploy 0x03286f21b84f30a52bca03d12f17443fc61a05109b55eeca2f8709176aa94abf --network sepolia --watch \
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
echo "PRICE_FEED_WBTC: $PRICE_FEED_WBTC"
echo "PRICE_FEED_USDC: $PRICE_FEED_USDC"
echo "PRICE_FEED_ETH: $PRICE_FEED_ETH"

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
starkli invoke --watch $PRICE_FEED_WBTC selector:set_main_oracle $MOCK_PRICE_FEED_WBTC
sleep 3
starkli invoke --watch $PRICE_FEED_WBTC selector:set_fallback_oracle $MOCK_PRICE_FEED_WBTC
sleep 3

starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_WBTC "2" $PRICE_FEED_WBTC u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_WBTC u256:800000000000000000 $PRICE_FEED_WBTC u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_WBTC 0x02 $IBC_WBTC $NCOL_WBTC
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_WBTC $IB_WBTC $IBC_WBTC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER
sleep 3

# Configure USDC
starkli invoke --watch $PRICE_FEED_USDC selector:set_main_oracle $MOCK_PRICE_FEED_USDC
sleep 3
starkli invoke --watch $PRICE_FEED_USDC selector:set_fallback_oracle $MOCK_PRICE_FEED_USDC
sleep 3
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_USDC "2" $PRICE_FEED_USDC u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_USDC u256:800000000000000000 $PRICE_FEED_USDC u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_USDC 0x02 $IBC_USDC $NCOL_USDC
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_USDC $IB_USDC $IBC_USDC u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER
sleep 3

# Configure ETH
starkli invoke --watch $PRICE_FEED_ETH selector:set_main_oracle $MOCK_PRICE_FEED_ETH
sleep 3
starkli invoke --watch $PRICE_FEED_ETH selector:set_fallback_oracle $MOCK_PRICE_FEED_ETH
sleep 3
starkli invoke --watch $CDP selector:register_debt $DEBT_ASSET_ETH "2" $PRICE_FEED_ETH u256:900000000000000000
sleep 3
starkli invoke --watch $CDP selector:register_collateral $UNDERLYING_ETH u256:800000000000000000 $PRICE_FEED_ETH u256:20000000000000000 $OWNER
sleep 3
starkli invoke --watch $CDP selector:set_collateral_tokens $UNDERLYING_ETH 0x02 $IBC_ETH $NCOL_ETH
sleep 3
starkli invoke --watch $IRM selector:init_market $DEBT_ASSET_ETH $IB_ETH $IBC_ETH u256:700000000000000000 u256:0 u256:700000000000000000 u256:1000000000000000000 u256:100000000000000000 $OWNER

# Shared Contracts:
# CDP: 0x0448a23f6d6201448062a597bbc9af033843f0f70001f57bdf0754dbf1a004d7
# IRM: 0x0348e08820c10f171e0f14a5a945722d5d4c9c010bb0a702ed5af08d2f47b40c
# PRICE_FEED: 0x04ab8ea10f6c0241d180b4527e471de287020df124803c3884295b52a804e850
# WBTC Contracts:
# MOCK_PRICE_FEED_WBTC: 0x01c854b9d828f5291d3518ca1172875596b5a46cbe41753048e326bca3cd1316
# NCOL_WBTC: 0x03242234507a01aa2ae2375a598a422a6853240675988ae31015a9ea2db2622d
# DEBT_ASSET_WBTC: 0x053ea9ea01536a966881292d9e4686ff48623db882144bb30b05b9c910e03005
# IBC_WBTC: 0x00d7e5df10da1180789edfe4f370027775649610ed565c197d9768fc6323146c
# IB_WBTC: 0x025e8c22f7d88c167e3f0db1231908e6fa1b4578dae9d48b0f9c885abf3ebe43
# USDC Contracts:
# MOCK_PRICE_FEED_USDC: 0x0419d629cb7b263e153132c87f60a4a21ee4ae42d8f65969c5b3af9844ac685e
# NCOL_USDC: 0x00a96f96a12d02cf75f322425a303493ac112aa5fdebb91838bd87ce0d81bb3e
# DEBT_ASSET_USDC: 0x002f3e1956d2b1cae1fa8129a98475704e32080fe8a897786587dc68915876a9
# IBC_USDC: 0x0340cdb5a2334f14851e8a4ce4a1a9a135376f4364d5b6c0bf9b67d5cd2fb308
# IB_USDC: 0x015a11cc96f59a7944052330e8bb06f8a3e5c640d4d68b5f6988a83b36fd4801
# ETH Contracts:
# MOCK_PRICE_FEED_ETH: 0x0036dd7b4ff9099246a4aa2c20e35ccc2f3ef8fc3a9913493940de4c1c7dc16a
# NCOL_ETH: 0x05775377c4bdc73585c7ea607d2fcb1bd674b0bffc5256693b0088f3cdb35c9e
# DEBT_ASSET_ETH: 0x05b28855e9f887ab313273d8297a9c8de779521eb6a7136532875fdd07897a69
# IBC_ETH: 0x072a3d2a681e13e371e716a57ef37ebcb8c3ffcd83b9ec2c4ec66088253c03a2
# IB_ETH: 0x07249ff3dc50128a6e382c8f1e1ea8f3f45147391c1eb0aea97e595c328442ae