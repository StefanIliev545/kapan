import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
  encodePullToken,
  encodeApprove,
  encodePushToken,
  encodeToOutput,
  createRouterInstruction,
  createProtocolInstruction,
  encodeLendingInstruction,
  LendingOp,
} from "./instructionHelpers";

export interface TokenConfig {
  address: string;
  decimals: number;
  whale?: string; // Address to impersonate for funding
}

export interface AmountsConfig {
  deposit: bigint;
  borrow: bigint;
  repay?: bigint; // If not provided, uses borrow amount
  withdraw?: bigint; // If not provided, uses deposit amount
}

export interface GatewayConfig {
  type: "aave" | "compound" | "venus";
  protocolName: string;
  deployArgs: any[]; // Arguments for gateway constructor
  factoryName: string; // Contract factory name (e.g., "AaveGatewayWrite")
}

export interface LendingTestConfig {
  collateralToken: TokenConfig;
  debtToken: TokenConfig;
  amounts: AmountsConfig;
  gateway: GatewayConfig;
  userFunding: {
    collateral: bigint;
    debt?: bigint; // Additional debt token funding if needed
  };
}

export interface TestSetup {
  user: any;
  router: any;
  gateway: any;
  collateralToken: any;
  debtToken: any;
}

/**
 * Setup function that deploys router, gateway, and funds user
 */
export async function setupLendingTest(config: LendingTestConfig): Promise<TestSetup> {
  const [deployer] = await ethers.getSigners();

  // New user wallet
  const user = ethers.Wallet.createRandom().connect(ethers.provider);

  // Get token contracts
  const collateralToken = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    config.collateralToken.address
  );
  const debtToken = await ethers.getContractAt(
    "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
    config.debtToken.address
  );

  // Fund user with ETH for gas
  const whaleAddress = config.collateralToken.whale || await deployer.getAddress();
  await network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [whaleAddress],
  });
  
  // Fund whale with ETH for gas
  await network.provider.send("hardhat_setBalance", [
    whaleAddress,
    "0x56BC75E2D63100000", // 100 ETH
  ]);
  
  const whale = await ethers.getSigner(whaleAddress);
  await whale.sendTransaction({ to: await user.getAddress(), value: ethers.parseEther("1") });

  // Fund user with collateral token
  await (collateralToken.connect(whale) as any).transfer(
    await user.getAddress(),
    config.userFunding.collateral
  );

  // Fund user with debt token if needed (for repay)
  if (config.userFunding.debt) {
    const debtWhaleAddress = config.debtToken.whale || await deployer.getAddress();
    if (config.debtToken.whale && config.debtToken.whale !== config.collateralToken.whale) {
      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [debtWhaleAddress],
      });
      // Fund debt whale with ETH for gas
      await network.provider.send("hardhat_setBalance", [
        debtWhaleAddress,
        "0x56BC75E2D63100000", // 100 ETH
      ]);
    }
    const debtWhale = await ethers.getSigner(debtWhaleAddress);
    await (debtToken.connect(debtWhale) as any).transfer(
      await user.getAddress(),
      config.userFunding.debt
    );
  }

  // Deploy router
  const Router = await ethers.getContractFactory("KapanRouter");
  const router = await Router.deploy(await deployer.getAddress());
  await router.waitForDeployment();

  // Deploy gateway
  const GatewayFactory = await ethers.getContractFactory(config.gateway.factoryName);
  const gateway = await GatewayFactory.deploy(await router.getAddress(), ...config.gateway.deployArgs);
  await gateway.waitForDeployment();

  // Register gateway with router
  await (await router.addGateway(config.gateway.protocolName, await gateway.getAddress())).wait();

  return { user, router, gateway, collateralToken, debtToken };
}

/**
 * Setup gateway and router approvals for a lending flow
 */
export async function setupApprovals(
  setup: TestSetup,
  config: LendingTestConfig,
  amounts: AmountsConfig
) {
  const { user, router, gateway, collateralToken, debtToken } = setup;

  // Gateway approvals (for borrow delegation and withdraw approval)
  const borObj = {
    op: LendingOp.Borrow,
    token: config.debtToken.address,
    user: await user.getAddress(),
    amount: amounts.borrow,
    context: "0x",
    input: { index: 0 },
  };
  const witObj = {
    op: LendingOp.WithdrawCollateral,
    token: config.collateralToken.address,
    user: await user.getAddress(),
    amount: amounts.withdraw || amounts.deposit,
    context: "0x",
    input: { index: 0 },
  };

  const [gatewayTargets, gatewayDatas] = await gateway.authorize([borObj, witObj], await user.getAddress());
  console.log("Gateway authorizations:");
  for (let i = 0; i < gatewayTargets.length; i++) {
    if (!gatewayTargets[i] || gatewayDatas[i].length === 0) continue;
    console.log(`  ${i}: target=${gatewayTargets[i]}, data=${gatewayDatas[i].substring(0, 20)}...`);
    await user.sendTransaction({ to: gatewayTargets[i], data: gatewayDatas[i] });
  }

  // Router approvals for PullToken instructions
  const repayAmt = amounts.repay || amounts.borrow;
  const isSameToken =
    config.debtToken.address.toLowerCase() === config.collateralToken.address.toLowerCase();

  // Approve router for amounts needed (since ERC20 approve() sets a new value)
  if (isSameToken) {
    // Same token: approve combined amount (deposit + repay)
    const totalNeeded = amounts.deposit + repayAmt;
    console.log(`  Approving router for total: ${totalNeeded}`);
    const approveIface = new ethers.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    const approveData = approveIface.encodeFunctionData("approve", [
      await router.getAddress(),
      totalNeeded,
    ]);
    await user.sendTransaction({ to: config.collateralToken.address, data: approveData });
  } else {
    // Different tokens: approve each separately
    console.log(`  Approving router for collateral: ${amounts.deposit}`);
    const approveCollateralIface = new ethers.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    const approveCollateralData = approveCollateralIface.encodeFunctionData("approve", [
      await router.getAddress(),
      amounts.deposit,
    ]);
    await user.sendTransaction({ to: config.collateralToken.address, data: approveCollateralData });

    console.log(`  Approving router for debt token: ${repayAmt}`);
    const approveDebtIface = new ethers.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    const approveDebtData = approveDebtIface.encodeFunctionData("approve", [
      await router.getAddress(),
      repayAmt,
    ]);
    await user.sendTransaction({ to: config.debtToken.address, data: approveDebtData });
  }
}

/**
 * Create instructions for a complete lending flow (deposit -> borrow -> repay -> withdraw)
 */
export async function createLendingFlowInstructions(
  setup: TestSetup,
  config: LendingTestConfig,
  amounts: AmountsConfig
): Promise<any[]> {
  const { user } = setup;
  const userAddr = user.getAddress ? await user.getAddress() : user;

  const repayAmt = amounts.repay || amounts.borrow;
  const withdrawAmt = amounts.withdraw || amounts.deposit;

  // Helper to create protocol instruction
  const createProtocolInstr = (op: LendingOp, token: string, amount: bigint, inputIndex: number) => {
    const encoded = encodeLendingInstruction(op, token, userAddr, amount, "0x", inputIndex);
    return createProtocolInstruction(config.gateway.protocolName, encoded);
  };

  return [
    // Deposit flow: Pull/Approve/Deposit
    createRouterInstruction(encodePullToken(amounts.deposit, config.collateralToken.address, userAddr)),
    createRouterInstruction(encodeApprove(0, config.gateway.protocolName)), // Creates UTXO[1] (empty)
    createProtocolInstr(LendingOp.DepositCollateral, config.collateralToken.address, 0n, 0), // Uses UTXO[0]

    // Borrow flow: ToOutput creates UTXO[2] with borrow amount, Borrow uses UTXO[2]
    createRouterInstruction(encodeToOutput(amounts.borrow, config.debtToken.address)), // Creates UTXO[2]
    createProtocolInstr(LendingOp.Borrow, config.debtToken.address, 0n, 2), // Uses UTXO[2], produces UTXO[3]

    // Repay flow: Pull/Approve/Repay
    createRouterInstruction(encodePullToken(repayAmt, config.debtToken.address, userAddr)), // Creates UTXO[4]
    createRouterInstruction(encodeApprove(4, config.gateway.protocolName)), // Creates UTXO[5] (empty)
    createProtocolInstr(LendingOp.Repay, config.debtToken.address, 0n, 4), // Uses UTXO[4], produces UTXO[6]

    // Withdraw flow: Withdraw + Push
    createProtocolInstr(LendingOp.WithdrawCollateral, config.collateralToken.address, withdrawAmt, 0), // Produces UTXO[7]
    createRouterInstruction(encodePushToken(7, userAddr)), // Push UTXO[7] to user
  ];
}

/**
 * Verify final balances after lending flow
 */
export async function verifyLendingFlowBalances(
  setup: TestSetup,
  config: LendingTestConfig,
  amounts: AmountsConfig,
  userBalanceBefore: bigint
) {
  const { router, collateralToken, debtToken, user } = setup;

  const userAddr = user.getAddress ? await user.getAddress() : user;

  // Check router balances (should be minimal)
  const routerCollateralBal = await collateralToken.balanceOf(await router.getAddress());
  const routerDebtBal = await debtToken.balanceOf(await router.getAddress());

  console.log(`Router collateral balance: ${routerCollateralBal}`);
  console.log(`Router debt balance: ${routerDebtBal}`);

  // Router should have minimal balance (maybe just repay refund)
  expect(routerCollateralBal).to.be.lt(amounts.deposit);

  // Check user balance
  const userBalanceAfter = await collateralToken.balanceOf(userAddr);
  console.log(`User balance after: ${userBalanceAfter} (started with ${userBalanceBefore})`);

  const repayAmt = amounts.repay || amounts.borrow;
  const withdrawAmt = amounts.withdraw || amounts.deposit;

  // User balance: before - deposit - repay (if same token) + withdraw
  let expectedUserBalance: bigint;
  if (
    config.collateralToken.address.toLowerCase() === config.debtToken.address.toLowerCase()
  ) {
    // Same token: userBalanceBefore - deposit - repay + withdraw
    expectedUserBalance = userBalanceBefore - amounts.deposit - repayAmt + withdrawAmt;
  } else {
    // Different tokens: userBalanceBefore - deposit + withdraw
    expectedUserBalance = userBalanceBefore - amounts.deposit + withdrawAmt;
  }

  expect(userBalanceAfter).to.equal(expectedUserBalance);
}

