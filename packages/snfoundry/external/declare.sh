starkli class-by-hash 0x078e647e45d1d01f6af14124f5dcc58fccc3a3c888d97169e321e2fbe5488436 --network mainnet --parse > cdp.json
starkli class-by-hash 0x03a4008a3e868c3545b61a38b054f054c22a9c8f242eeeaa536c7d9c2226694b --network mainnet --parse > interest-rate-model.json
starkli class-by-hash 0x03b6c6b615ff3df037d5fdad054b62ad89092149958b1500c1d281fd6f2fd14b --network mainnet --parse > pricefeed.json
starkli class-by-hash 0x074aad3c412b1d7c05f720abfd39adc709b8bf8a8c7640e50505a9436a6ff0cf --network mainnet --parse > debt-asset.json
starkli class-by-hash 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network mainnet --parse > ncollateral-asset.json
starkli class-by-hash 0x076b533a863ea90cc391c5226ec5d5b6466bfeb0721d6c970d3b627a18de720d --network mainnet --parse > n-asset.json
starkli class-by-hash 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network mainnet --parse > nib-asset.json
starkli class-by-hash 0x029fd83b01f02b45987dfb9652633cd0f1f64a0f36403ab1fed7bd99642fa474 --network mainnet --parse > nibc-asset.json

export STARKNET_KEYSTORE="/workspaces/kapan/packages/snfoundry/account/keystore"
export STARKNET_ACCOUNT="/workspaces/kapan/packages/snfoundry/account/account.json"

starkli declare /workspaces/kapan/packages/snfoundry/external/cdp.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/interest-rate-model.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/pricefeed.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/debt-asset.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/ncollateral-asset.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/n-asset.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/nib-asset.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/external/nibc-asset.json --network sepolia
starkli declare /workspaces/kapan/packages/snfoundry/contracts/target/release/kapan_MockFeed.contract_class.json --network sepolia


