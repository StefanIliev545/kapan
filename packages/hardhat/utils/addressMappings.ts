export interface AaveConfig {
  enabled: boolean;
  poolAddressesProvider: string;
  uiPoolDataProvider: string;
  referralCode: number;
}

export const AAVE_V3_CONFIG: Record<string, AaveConfig> = {
  mainnet: {
    enabled: true,
    poolAddressesProvider: '0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e',
    uiPoolDataProvider: '0x3F78BBD206e4D3c504Eb854232EdA7e47E9Fd8FC',
    referralCode: 0,
  },
  polygon: {
    enabled: true,
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0x68100bD5345eA474D93577127C11F39FF8463e93',
    referralCode: 0,
  },
  optimism: {
    enabled: true,
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4',
    referralCode: 0,
  },
  arbitrum: {
    enabled: true,
    poolAddressesProvider: '0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb',
    uiPoolDataProvider: '0x5c5228aC8BC1528482514aF3e27E692495148717',
    referralCode: 0,
  },
};

export interface CompoundConfig {
  enabled: boolean;
  comets: string[];
  chainlinkFeedRegistry: string;
  weth: string;
  wethPriceFeed: string;
}

export const COMPOUND_CONFIG: Record<string, CompoundConfig> = {
  mainnet: {
    enabled: true,
    comets: [
      '0xc3d688B66703497DAA19211EEdff47f25384cdc3', // USDC
      '0x3Afdc9BCA9213A35503b077a6072F3D0d5AB0840', // USDT
      '0x5D409e56D886231aDAf00c8775665AD0f9897b56', // USDS
      '0xe85Dc543813B8c2CFEaAc371517b925a166a9293', // WBTC
      '0xA17581A9E3356d9A858b789D68B4d866e593aE94', // WETH
      '0x3D0bb1ccaB520A66e607822fC55BC921738fAFE3', // WSTETH
    ],
    chainlinkFeedRegistry: '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    wethPriceFeed: '0x5f4eC3Df9cbd43714Fe2740f5E3616155c5b8419',
  },
  base: {
    enabled: true,
    comets: [
      '0xb125E6687d4313864e53df431d5425969c15Eb2F', // USDC
      '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf', // USDbc
      '0x2c776041CCFe903071AF44aa147368a9c8EEA518', // USDS
      '0x46e6b214b524310239732D51387075E0e70970bf', // WETH
      '0x784efeB622244d2348d4F2522f8860B96fbEcE89', // AERO
    ],
    chainlinkFeedRegistry: '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf',
    weth: '0x4200000000000000000000000000000000000006',
    wethPriceFeed: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70',
  },
  optimism: {
    enabled: true,
    comets: [
      '0x2e44e174f7D53F0212823acC11C01A11d58c5bCB', // USDC
      '0x995E394b8B2437aC8Ce61Ee0bC610D617962B214', // USDT
      '0xE36A30D249f7761327fd973001A32010b521b6Fd', // WETH
    ],
    chainlinkFeedRegistry: '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf',
    weth: '0x4200000000000000000000000000000000000006',
    wethPriceFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
  },
  unichain: {
    enabled: true,
    comets: [
      '0x2c7118c4C88B9841FCF839074c26Ae8f035f2921', // USDC
      '0x6C987dDE50dB1dcDd32Cd4175778C2a291978E2a', // WETH
    ],
    chainlinkFeedRegistry: '0x47Fb2585D2C56Fe188D0E6ec628a38b74fCeeeDf',
    weth: '0x4200000000000000000000000000000000000006',
    wethPriceFeed: '0x13e3Ee699D1909E989722E753853AE30b17e08c5',
  },
};

export interface VenusConfig {
  enabled: boolean;
  comptroller: string;
  oracle: string;
}

export const VENUS_CONFIG: Record<string, VenusConfig> = {
  bnb: {
    enabled: true,
    comptroller: '0xfD36E2c2a6789Db23113685031d7F16329158384',
    oracle: '0x7FabdD617200C9CB4dcf3dd2C41273e60552068A',
  },
};

