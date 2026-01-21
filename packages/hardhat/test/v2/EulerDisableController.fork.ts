import { expect } from "chai";
import { ethers, network } from "hardhat";
import { Contract, Signer } from "ethers";

/**
 * Fork test for Euler V2 controller switching
 *
 * Scenario: User has a sub-account with collateral and borrows from vault A.
 * User repays all debt to vault A. User then wants to borrow from vault B.
 * The authorize() flow should:
 * 1. Disable vault A as controller (since debt = 0)
 * 2. Enable vault B as controller
 *
 * Run with: MAINNET_FORKING_ENABLED=true FORK_CHAIN=arbitrum npx hardhat test test/v2/EulerDisableController.fork.ts
 */
describe("Euler disableController flow", function () {
  this.timeout(120000);

  // Euler V2 on Arbitrum
  const EVC_ADDRESS = "0x6302ef0F34100CDDFb5489fbcB6eE1AA95CD1066";

  // Known Euler vaults on Arbitrum (from Euler.fork.ts)
  const USDC_VAULT = "0x0a1eCC5Fe8C9be3C809844fcBe615B46A869b899";
  const WETH_VAULT = "0x78E3E051D32157AACD550fBB78458762d8f7edFF";

  // User's old vault for debugging the real case
  const USER_OLD_VAULT = "0x37512F45B4ba8808910632323b73783Ca938CD51";

  // USDC on Arbitrum
  const USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
  const USDC_WHALE = "0x47c031236e19d024b42f8AE6780E44A573170703";

  let signer: Signer;
  let evc: Contract;
  let usdcVault: Contract;
  let wethVault: Contract;
  let userOldVault: Contract;
  let usdc: Contract;
  let userAddress: string;

  before(async function () {
    // Check if running on Arbitrum fork
    const chainId = network.config.chainId;
    const forkChain = (process.env.FORK_CHAIN || "").toLowerCase();

    // Accept Arbitrum mainnet (42161), localhost (31337), or FORK_CHAIN=arbitrum
    if (chainId !== 42161 && chainId !== 31337 && forkChain !== "arbitrum") {
      console.log(`Skipping - need Arbitrum fork (got chainId ${chainId}, FORK_CHAIN=${forkChain})`);
      this.skip();
      return;
    }

    // Get signer
    const signers = await ethers.getSigners();
    signer = signers[0];
    userAddress = await signer.getAddress();

    // Calculate sub-account (index 0)
    const userInt = BigInt(userAddress);
    const subAccount = ethers.getAddress(
      "0x" + ((userInt & ~BigInt(0xFF)) | BigInt(0)).toString(16).padStart(40, "0")
    );
    console.log("User address:", userAddress);
    console.log("Sub-account (index 0):", subAccount);

    // Setup EVC contract
    evc = await ethers.getContractAt([
      "function getControllers(address) view returns (address[])",
      "function getCollaterals(address) view returns (address[])",
      "function isControllerEnabled(address,address) view returns (bool)",
      "function isCollateralEnabled(address,address) view returns (bool)",
      "function isAccountOperatorAuthorized(address,address) view returns (bool)",
      "function call(address,address,uint256,bytes) external payable returns (bytes)",
      "function enableCollateral(address,address) external",
      "function enableController(address,address) external",
      "function setAccountOperator(address,address,bool) external"
    ], EVC_ADDRESS, signer);

    // Setup vault contracts
    const vaultAbi = [
      "function asset() view returns (address)",
      "function debtOf(address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)",
      "function deposit(uint256,address) returns (uint256)",
      "function borrow(uint256,address) returns (uint256)",
      "function repay(uint256,address) returns (uint256)",
      "function disableController() external",
      "function LTVBorrow(address) view returns (uint16)",
      "function name() view returns (string)",
      "function convertToAssets(uint256) view returns (uint256)"
    ];

    usdcVault = await ethers.getContractAt(vaultAbi, USDC_VAULT, signer);
    wethVault = await ethers.getContractAt(vaultAbi, WETH_VAULT, signer);
    userOldVault = await ethers.getContractAt(vaultAbi, USER_OLD_VAULT, signer);

    usdc = await ethers.getContractAt([
      "function balanceOf(address) view returns (uint256)",
      "function approve(address,uint256) returns (bool)",
      "function transfer(address,uint256) returns (bool)"
    ], USDC, signer);

    // Fund signer with USDC from whale
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [USDC_WHALE],
    });
    await network.provider.send("hardhat_setBalance", [USDC_WHALE, "0x56BC75E2D63100000"]);
    const whale = await ethers.getSigner(USDC_WHALE);

    const usdcWhale = usdc.connect(whale);
    const amount = ethers.parseUnits("10000", 6); // 10k USDC
    await usdcWhale.transfer(userAddress, amount);

    console.log("User USDC balance:", ethers.formatUnits(await usdc.balanceOf(userAddress), 6));
    console.log("USDC vault:", USDC_VAULT);
    console.log("WETH vault:", WETH_VAULT);
  });

  it("should debug: inspect existing user state", async function () {
    // Check the real user from the bug report
    const realSubAccount = "0xDeDb4D230d8b1e9268Fd46779a8028D5dAaa8fA2";
    const realOwner = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";

    console.log("\n=== Real user state ===");
    console.log("Sub-account:", realSubAccount);
    console.log("Owner:", realOwner);

    const controllers = await evc.getControllers(realSubAccount);
    console.log("Controllers:", controllers);

    if (controllers.length > 0) {
      const debt = await userOldVault.debtOf(realSubAccount);
      console.log("Debt on user's old vault:", debt.toString());
    }

    const collaterals = await evc.getCollaterals(realSubAccount);
    console.log("Collaterals:", collaterals);

    // Also check what vaults look like
    console.log("\n=== Vault info ===");
    console.log("USDC Vault name:", await usdcVault.name());
    console.log("WETH Vault name:", await wethVault.name());
  });

  it("should test disableController with REAL user addresses", async function () {
    // Real addresses from the bug report
    const realSubAccount = "0xDeDb4D230d8b1e9268Fd46779a8028D5dAaa8fA2";
    const realOwner = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
    const realOldVault = "0x37512F45B4ba8808910632323b73783Ca938CD51";

    console.log("\n=== Testing with REAL user addresses ===");

    // Impersonate the real owner
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [realOwner],
    });
    await network.provider.send("hardhat_setBalance", [realOwner, "0x56BC75E2D63100000"]);
    const realSigner = await ethers.getSigner(realOwner);

    // Check current state
    const controllers = await evc.getControllers(realSubAccount);
    console.log("Current controllers:", controllers);

    if (controllers.length === 0) {
      console.log("No controllers - need to set one up first");

      // Setup: enable the old vault as controller so we can test disabling it
      const evcAsOwner = evc.connect(realSigner);
      await evcAsOwner.enableController(realSubAccount, realOldVault);
      console.log("Enabled controller:", realOldVault);
      console.log("Controllers after enable:", await evc.getControllers(realSubAccount));
    }

    // Now test disabling it
    console.log("\nTesting evc.call to disable controller...");
    const disableSelector = "0x869e50c7"; // disableController()

    const evcAsOwner = evc.connect(realSigner);

    try {
      // This is exactly what the frontend would execute
      const tx = await evcAsOwner.call(realOldVault, realSubAccount, 0, disableSelector);
      await tx.wait();
      console.log("SUCCESS! Controller disabled");
      console.log("Controllers after disable:", await evc.getControllers(realSubAccount));
    } catch (error: unknown) {
      const err = error as Error & { data?: string };
      console.log("FAILED:", err.message);
      if (err.data) {
        console.log("Error data:", err.data);
      }
      throw error;
    }
  });

  it("should test FULL gateway authorize flow with real user scenario", async function () {
    // Real addresses from the bug report
    const realSubAccount = "0xDeDb4D230d8b1e9268Fd46779a8028D5dAaa8fA2";
    const realOwner = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
    const realOldVault = "0x37512F45B4ba8808910632323b73783Ca938CD51";
    // Sub-account index: last byte of 0x...fA2 = 0xA2 = 162
    const subAccountIndex = 162;

    console.log("\n=== Testing FULL gateway authorize flow ===");

    // Impersonate the real owner
    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [realOwner],
    });
    await network.provider.send("hardhat_setBalance", [realOwner, "0x56BC75E2D63100000"]);
    const realSigner = await ethers.getSigner(realOwner);

    // Setup: enable old controller so we have something to disable
    const evcAsOwner = evc.connect(realSigner);
    let controllers = await evc.getControllers(realSubAccount);
    if (controllers.length === 0) {
      await evcAsOwner.enableController(realSubAccount, realOldVault);
      console.log("Setup: enabled old controller");
    }

    // Also need some collateral enabled for the borrow to work
    const collaterals = await evc.getCollaterals(realSubAccount);
    if (collaterals.length === 0) {
      // Enable USDC vault as collateral
      await evcAsOwner.enableCollateral(realSubAccount, USDC_VAULT);
      console.log("Setup: enabled USDC vault as collateral");
    }

    console.log("Initial state:");
    console.log("  Controllers:", await evc.getControllers(realSubAccount));
    console.log("  Collaterals:", await evc.getCollaterals(realSubAccount));

    // Deploy gateway
    const EulerGatewayWrite = await ethers.getContractFactory("EulerGatewayWrite");
    const gateway = await EulerGatewayWrite.deploy(realOwner, realOwner, EVC_ADDRESS);
    await gateway.waitForDeployment();
    console.log("\nGateway deployed:", await gateway.getAddress());

    // Build borrow instruction - trying to borrow from WETH vault with MULTIPLE collaterals
    // New context format: (address borrowVault, address[] collateralVaults, uint8 subAccountIndex)
    const context = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address[]", "uint8"],
      [WETH_VAULT, [USDC_VAULT, USER_OLD_VAULT], subAccountIndex] // Multiple collaterals!
    );

    const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const borrowInstruction = {
      op: 3, // Borrow
      token: WETH,
      user: realOwner,  // User's main address, NOT subAccount
      amount: ethers.parseUnits("0.001", 18),
      context: context,
      input: { index: 0 }
    };

    console.log("\nCalling authorize() with:");
    console.log("  user (caller):", realOwner);
    console.log("  borrowVault:", WETH_VAULT);
    console.log("  collateralVault:", USDC_VAULT);
    console.log("  subAccountIndex:", subAccountIndex);

    const [targets, data, _produced] = await gateway.authorize(
      [borrowInstruction],
      realOwner,
      []
    );

    console.log("\nAuthorization targets generated:");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;
      const selector = data[i].slice(0, 10);
      let name = "unknown";
      if (selector === "0x9f5c462a") name = "setAccountOperator";
      if (selector === "0x43c4771d") name = "enableCollateral";
      if (selector === "0xc368516c") name = "enableController";
      if (selector === "0x1f8b5215") name = "call (disableController)";
      console.log(`  [${i}] ${name} - target: ${targets[i]}`);
      console.log(`       data: ${data[i]}`);
    }

    // Execute each authorization call as the real user
    console.log("\nExecuting authorization calls...");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;

      const selector = data[i].slice(0, 10);
      let name = selector;
      if (selector === "0x9f5c462a") name = "setAccountOperator";
      if (selector === "0x43c4771d") name = "enableCollateral";
      if (selector === "0xc368516c") name = "enableController";
      if (selector === "0x1f8b5215") name = "call (disableController)";

      console.log(`  Executing [${i}] ${name}...`);
      try {
        const tx = await realSigner.sendTransaction({
          to: targets[i],
          data: data[i]
        });
        await tx.wait();
        console.log("    SUCCESS!");
      } catch (error: unknown) {
        const err = error as Error & { data?: string; reason?: string };
        console.log("    FAILED:", err.message);
        if (err.reason) console.log("    Reason:", err.reason);
        if (err.data) console.log("    Data:", err.data);
        throw error;
      }
    }

    // Verify final state
    console.log("\nFinal state:");
    console.log("  Controllers:", await evc.getControllers(realSubAccount));
    console.log("  Old vault is controller:", await evc.isControllerEnabled(realSubAccount, realOldVault));
    console.log("  WETH vault is controller:", await evc.isControllerEnabled(realSubAccount, WETH_VAULT));
  });

  it("should check if real vault has disableController function", async function () {
    const realOldVault = "0x37512F45B4ba8808910632323b73783Ca938CD51";

    console.log("\n=== Checking real vault implementation ===");
    console.log("Real old vault:", realOldVault);

    // Get vault bytecode
    const code = await ethers.provider.getCode(realOldVault);
    console.log("Vault has code:", code.length > 2);
    console.log("Code length:", code.length);

    // Check if disableController selector exists in bytecode
    const disableSelector = "869e50c7";
    const hasSelector = code.toLowerCase().includes(disableSelector);
    console.log("Has disableController selector (869e50c7):", hasSelector);

    // Compare with known good Euler vault
    console.log("\n--- Comparing with known Euler vaults ---");
    const knownGoodVault = USDC_VAULT;
    const knownCode = await ethers.provider.getCode(knownGoodVault);
    console.log("Known USDC vault:", knownGoodVault);
    console.log("Known vault code length:", knownCode.length);
    console.log("Known vault has disableController:", knownCode.toLowerCase().includes(disableSelector));

    // Check if it's a proxy - look for typical proxy patterns
    console.log("\n--- Checking if proxies ---");

    // Try to read proxy-related storage slots
    // EIP-1967 implementation slot: 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
    const implSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const realVaultImpl = await ethers.provider.getStorage(realOldVault, implSlot);
    const knownVaultImpl = await ethers.provider.getStorage(knownGoodVault, implSlot);
    console.log("Real vault impl slot:", realVaultImpl);
    console.log("Known vault impl slot:", knownVaultImpl);

    // Try to get name/symbol to identify the vault
    const vaultWithInfo = await ethers.getContractAt([
      "function name() view returns (string)",
      "function symbol() view returns (string)",
      "function asset() view returns (address)"
    ], realOldVault);

    try {
      console.log("\n--- Vault info ---");
      console.log("Name:", await vaultWithInfo.name());
      console.log("Symbol:", await vaultWithInfo.symbol());
      console.log("Asset:", await vaultWithInfo.asset());
    } catch (e: unknown) {
      const err = e as Error;
      console.log("Could not read vault info:", err.message.slice(0, 50));
    }

    // Check if the implementation has disableController
    if (realVaultImpl !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const implAddress = "0x" + realVaultImpl.slice(-40);
      console.log("\n--- Implementation contract ---");
      console.log("Implementation address:", implAddress);
      const implCode = await ethers.provider.getCode(implAddress);
      console.log("Implementation code length:", implCode.length);
      console.log("Implementation has disableController:", implCode.toLowerCase().includes(disableSelector));
    }

    // Check beacon proxy pattern - EIP-1967 beacon slot
    const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
    const realVaultBeacon = await ethers.provider.getStorage(realOldVault, beaconSlot);
    const knownVaultBeacon = await ethers.provider.getStorage(knownGoodVault, beaconSlot);
    console.log("\n--- Beacon proxy check ---");
    console.log("Real vault beacon slot:", realVaultBeacon);
    console.log("Known vault beacon slot:", knownVaultBeacon);

    // If not a beacon proxy, maybe they delegate differently
    // Let's try calling a function that returns the implementation
    console.log("\n--- Trying to find implementation ---");

    // Some proxies have an implementation() function
    try {
      const proxyContract = await ethers.getContractAt([
        "function implementation() view returns (address)"
      ], realOldVault);
      const impl = await proxyContract.implementation();
      console.log("implementation() returns:", impl);
    } catch {
      console.log("No implementation() function");
    }

    // Try looking for _EVCAddress storage or beacon pattern
    // EVK vaults might store this differently
    // The bytecode is 734 bytes which is small - let's decode it
    console.log("\n--- Proxy bytecode analysis ---");
    console.log("First 200 chars of bytecode:", code.slice(0, 200));

    // This looks like a minimal proxy - try to extract the implementation from bytecode
    // Minimal proxy pattern: 363d3d373d3d3d363d73<implementation>5af43d82803e903d91602b57fd5bf3
    if (code.includes("363d3d373d3d3d363d73")) {
      console.log("Detected minimal proxy pattern!");
      const start = code.indexOf("363d3d373d3d3d363d73") + 20;
      const implFromBytecode = "0x" + code.slice(start, start + 40);
      console.log("Implementation from bytecode:", implFromBytecode);

      const implCode2 = await ethers.provider.getCode(implFromBytecode);
      console.log("Implementation code length:", implCode2.length);
      console.log("Implementation has disableController:", implCode2.toLowerCase().includes(disableSelector));
    }

    // Get implementation from beacon
    if (realVaultBeacon !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
      const beaconAddress = "0x" + realVaultBeacon.slice(-40);
      console.log("\n--- Beacon implementation check ---");
      console.log("Beacon address:", beaconAddress);

      const beacon = await ethers.getContractAt([
        "function implementation() view returns (address)"
      ], beaconAddress);

      try {
        const impl = await beacon.implementation();
        console.log("Beacon implementation:", impl);

        const implCode3 = await ethers.provider.getCode(impl);
        console.log("Implementation code length:", implCode3.length);
        console.log("Implementation has disableController:", implCode3.toLowerCase().includes(disableSelector));

        // Actually try to call disableController through EVC on the real vault
        console.log("\n--- Testing actual evc.call with real vault ---");
        const realSubAccount = "0xDeDb4D230d8b1e9268Fd46779a8028D5dAaa8fA2";
        const realOwner = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";

        await network.provider.request({
          method: "hardhat_impersonateAccount",
          params: [realOwner],
        });
        await network.provider.send("hardhat_setBalance", [realOwner, "0x56BC75E2D63100000"]);
        const realSigner = await ethers.getSigner(realOwner);

        // First enable the controller
        const evcAsOwner = evc.connect(realSigner);
        const controllers = await evc.getControllers(realSubAccount);
        if (controllers.length === 0) {
          await evcAsOwner.enableController(realSubAccount, realOldVault);
          console.log("Enabled controller for test");
        }
        console.log("Controllers:", await evc.getControllers(realSubAccount));

        // Now try the actual evc.call with the REAL old vault
        console.log("Calling evc.call(realOldVault, subAccount, 0, disableSelector)...");
        try {
          const tx = await evcAsOwner.call(realOldVault, realSubAccount, 0, "0x" + disableSelector);
          await tx.wait();
          console.log("SUCCESS!");
          console.log("Controllers after:", await evc.getControllers(realSubAccount));
        } catch (e: unknown) {
          const err = e as Error & { data?: string };
          console.log("FAILED:", err.message);
          if (err.data) console.log("Error data:", err.data);
        }
      } catch (e: unknown) {
        const err = e as Error;
        console.log("Could not get beacon implementation:", err.message.slice(0, 50));
      }
    }
  });

  it("should test if disableController works WITHOUT setAccountOperator first", async function () {
    const realSubAccount = "0xDeDb4D230d8b1e9268Fd46779a8028D5dAaa8fA2";
    const realOwner = "0xdEdb4d230d8b1E9268Fd46779A8028D5DAAa8fa3";
    const realOldVault = "0x37512F45B4ba8808910632323b73783Ca938CD51";

    console.log("\n=== Testing disableController WITHOUT setAccountOperator ===");

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [realOwner],
    });
    await network.provider.send("hardhat_setBalance", [realOwner, "0x56BC75E2D63100000"]);
    const realSigner = await ethers.getSigner(realOwner);

    // Setup: enable old controller
    const evcAsOwner = evc.connect(realSigner);
    let controllers = await evc.getControllers(realSubAccount);
    if (controllers.length === 0) {
      await evcAsOwner.enableController(realSubAccount, realOldVault);
      console.log("Setup: enabled old controller");
    }
    console.log("Controllers before:", await evc.getControllers(realSubAccount));

    // Try to disable WITHOUT setAccountOperator - owner should be able to do this directly
    console.log("\nCalling evc.call(disableController) as owner without setAccountOperator...");
    const disableSelector = "0x869e50c7";

    try {
      const tx = await evcAsOwner.call(realOldVault, realSubAccount, 0, disableSelector);
      await tx.wait();
      console.log("SUCCESS! Owner can disable controller without being operator");
      console.log("Controllers after:", await evc.getControllers(realSubAccount));
    } catch (error: unknown) {
      const err = error as Error;
      console.log("FAILED:", err.message);
      console.log("This might indicate the owner needs operator status too");
      throw error;
    }
  });

  it("should enable MULTIPLE collaterals when borrowing", async function () {
    console.log("\n=== Testing MULTIPLE collateral enabling ===");

    // Use a fresh sub-account (index 3) with NO collaterals enabled
    const userInt = BigInt(userAddress);
    const testSubAccount = ethers.getAddress(
      "0x" + ((userInt & ~BigInt(0xFF)) | BigInt(3)).toString(16).padStart(40, "0")
    );
    console.log("Test sub-account (index 3):", testSubAccount);

    // Verify starting state - no collaterals, no controllers
    console.log("\nInitial state:");
    console.log("  Controllers:", await evc.getControllers(testSubAccount));
    console.log("  Collaterals:", await evc.getCollaterals(testSubAccount));
    expect((await evc.getCollaterals(testSubAccount)).length).to.equal(0);

    // Deploy gateway
    const EulerGatewayWrite = await ethers.getContractFactory("EulerGatewayWrite");
    const gateway = await EulerGatewayWrite.deploy(userAddress, userAddress, EVC_ADDRESS);
    await gateway.waitForDeployment();
    console.log("Gateway deployed:", await gateway.getAddress());

    // Build borrow instruction with TWO collaterals - neither is enabled yet
    // Context format: (address borrowVault, address[] collateralVaults, uint8 subAccountIndex)
    const context = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address[]", "uint8"],
      [WETH_VAULT, [USDC_VAULT, USER_OLD_VAULT], 3] // Two collaterals!
    );

    const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const borrowInstruction = {
      op: 3, // Borrow
      token: WETH,
      user: userAddress,
      amount: ethers.parseUnits("0.001", 18),
      context: context,
      input: { index: 0 }
    };

    console.log("\nCalling authorize() with TWO collaterals...");
    const [targets, data, _produced] = await gateway.authorize(
      [borrowInstruction],
      userAddress,
      []
    );

    // Count enableCollateral calls
    let enableCollateralCount = 0;

    console.log("\nAuthorization targets:");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;
      const selector = data[i].slice(0, 10);
      let name = selector;
      if (selector === "0x9f5c462a") name = "setAccountOperator";
      if (selector === "0xd44fee5a") {
        name = "enableCollateral";
        enableCollateralCount++;
      }
      if (selector === "0xc368516c") name = "enableController";
      if (selector === "0x1f8b5215") name = "call (disableController)";
      console.log(`  [${i}] ${name}`);
    }

    console.log(`\nTotal enableCollateral calls: ${enableCollateralCount}`);
    expect(enableCollateralCount).to.equal(2, "Should have 2 enableCollateral calls for 2 collaterals");

    // Execute the authorization calls
    console.log("\nExecuting authorization calls...");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;
      const tx = await signer.sendTransaction({ to: targets[i], data: data[i] });
      await tx.wait();
    }

    // Verify final state - BOTH collaterals should be enabled
    console.log("\nFinal state:");
    const finalCollaterals = await evc.getCollaterals(testSubAccount);
    console.log("  Collaterals:", finalCollaterals);
    console.log("  Controllers:", await evc.getControllers(testSubAccount));

    expect(finalCollaterals.length).to.equal(2, "Should have 2 collaterals enabled");
    expect(await evc.isCollateralEnabled(testSubAccount, USDC_VAULT)).to.equal(true, "USDC vault should be enabled");
    expect(await evc.isCollateralEnabled(testSubAccount, USER_OLD_VAULT)).to.equal(true, "User old vault should be enabled");
    expect(await evc.isControllerEnabled(testSubAccount, WETH_VAULT)).to.equal(true, "WETH vault should be controller");

    console.log("\n✓ Both collaterals enabled successfully!");
  });

  it("should be able to disable controller via evc.call directly", async function () {
    // Test the evc.call pattern directly with a fresh account
    console.log("\n=== Testing evc.call pattern ===");

    // Use sub-account index 1 for this test
    const userInt = BigInt(userAddress);
    const testSubAccount = ethers.getAddress(
      "0x" + ((userInt & ~BigInt(0xFF)) | BigInt(1)).toString(16).padStart(40, "0")
    );
    console.log("Test sub-account (index 1):", testSubAccount);

    // Step 1: Deposit collateral and enable it
    console.log("\n1. Depositing collateral into USDC vault...");
    const depositAmount = ethers.parseUnits("1000", 6);
    await usdc.approve(USDC_VAULT, depositAmount);
    await usdcVault.deposit(depositAmount, testSubAccount);

    // Enable as collateral for the sub-account
    await evc.enableCollateral(testSubAccount, USDC_VAULT);
    console.log("   Collateral enabled:", await evc.isCollateralEnabled(testSubAccount, USDC_VAULT));

    // Step 2: Enable controller (USDC vault)
    console.log("\n2. Enabling controller...");
    await evc.enableController(testSubAccount, USDC_VAULT);
    console.log("   Controller enabled:", await evc.isControllerEnabled(testSubAccount, USDC_VAULT));

    // Check if vault has LTV for itself as collateral (self-collateralized)
    const ltvBorrow = await usdcVault.LTVBorrow(USDC_VAULT);
    console.log("   LTV for self-collateral:", ltvBorrow);

    if (ltvBorrow > 0) {
      // Can borrow with self-collateral
      const borrowAmount = ethers.parseUnits("100", 6);

      // Use EVC call to borrow on behalf of sub-account
      const borrowData = usdcVault.interface.encodeFunctionData("borrow", [borrowAmount, userAddress]);
      await evc.call(USDC_VAULT, testSubAccount, 0, borrowData);

      const debtAfterBorrow = await usdcVault.debtOf(testSubAccount);
      console.log("   Debt after borrow:", ethers.formatUnits(debtAfterBorrow, 6));

      // Step 3: Repay all debt
      console.log("\n3. Repaying all debt...");
      await usdc.approve(USDC_VAULT, debtAfterBorrow * 2n); // Approve extra for interest
      await usdcVault.repay(debtAfterBorrow * 2n, testSubAccount);

      const debtAfterRepay = await usdcVault.debtOf(testSubAccount);
      console.log("   Debt after repay:", debtAfterRepay.toString());
      expect(debtAfterRepay).to.equal(0);
    } else {
      console.log("   Skipping borrow/repay - vault doesn't support self-collateral");
    }

    // Step 4: Test disabling controller via evc.call
    console.log("\n4. Testing disableController via evc.call...");
    console.log("   Controllers before:", await evc.getControllers(testSubAccount));

    const disableSelector = "0x869e50c7"; // disableController()

    try {
      const tx = await evc.call(USDC_VAULT, testSubAccount, 0, disableSelector);
      await tx.wait();
      console.log("   SUCCESS! Controller disabled");
      console.log("   Controllers after:", await evc.getControllers(testSubAccount));

      expect(await evc.isControllerEnabled(testSubAccount, USDC_VAULT)).to.equal(false);
    } catch (error: unknown) {
      const err = error as Error & { data?: string };
      console.log("   FAILED:", err.message);

      // Try to decode the error
      if (err.data) {
        console.log("   Error data:", err.data);
      }
      throw error;
    }
  });

  it("should test the full authorize() flow with controller switching", async function () {
    console.log("\n=== Testing authorize() flow ===");

    // Deploy EulerGatewayWrite for testing
    const EulerGatewayWrite = await ethers.getContractFactory("EulerGatewayWrite");
    const router = userAddress; // Use user as mock router for testing
    const gateway = await EulerGatewayWrite.deploy(router, userAddress, EVC_ADDRESS);
    await gateway.waitForDeployment();
    console.log("Gateway deployed:", await gateway.getAddress());

    // Use sub-account index 2 for this test
    const userInt = BigInt(userAddress);
    const testSubAccount = ethers.getAddress(
      "0x" + ((userInt & ~BigInt(0xFF)) | BigInt(2)).toString(16).padStart(40, "0")
    );
    console.log("Test sub-account (index 2):", testSubAccount);

    // Setup: deposit collateral and enable USDC vault as controller
    console.log("\n1. Setting up initial position with USDC vault as controller...");
    const depositAmount = ethers.parseUnits("500", 6);
    await usdc.approve(USDC_VAULT, depositAmount);
    await usdcVault.deposit(depositAmount, testSubAccount);
    await evc.enableCollateral(testSubAccount, USDC_VAULT);
    await evc.enableController(testSubAccount, USDC_VAULT);

    console.log("   Controller (USDC vault) enabled:", await evc.isControllerEnabled(testSubAccount, USDC_VAULT));
    console.log("   Debt on USDC vault:", (await usdcVault.debtOf(testSubAccount)).toString());

    // Now test authorize() for borrowing from WETH vault (different controller)
    // This should generate: disableController(USDC), enableController(WETH)
    console.log("\n2. Calling authorize() for borrow from WETH vault...");

    // Encode context for WETH vault borrow with USDC vault as collateral
    const context = ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint8"],
      [WETH_VAULT, USDC_VAULT, 2] // borrowVault, collateralVault, subAccountIndex
    );

    const WETH = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
    const borrowInstruction = {
      op: 3, // Borrow
      token: WETH,
      user: userAddress,
      amount: ethers.parseUnits("0.01", 18),
      context: context,
      input: { index: 0 }
    };

    const [targets, data, _produced] = await gateway.authorize(
      [borrowInstruction],
      userAddress,
      []
    );

    console.log("\n   Authorization targets:");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;
      console.log(`   [${i}] Target: ${targets[i]}`);
      console.log(`       Data: ${data[i].slice(0, 10)}...`); // Just selector

      // Decode the selector
      const selector = data[i].slice(0, 10);
      if (selector === "0x3ebf7385") console.log("       -> setAccountOperator");
      if (selector === "0x43c4771d") console.log("       -> enableCollateral");
      if (selector === "0x0753c30c") console.log("       -> enableController");
      if (selector === "0x1f8b5218") console.log("       -> call (should be disableController)");
    }

    // Execute the authorization transactions
    console.log("\n3. Executing authorization transactions...");
    for (let i = 0; i < targets.length; i++) {
      if (targets[i] === ethers.ZeroAddress) continue;

      console.log(`   Executing tx ${i}...`);
      try {
        const tx = await signer.sendTransaction({
          to: targets[i],
          data: data[i]
        });
        await tx.wait();
        console.log("   Success!");
      } catch (error: unknown) {
        const err = error as Error;
        console.log("   Failed:", err.message);
        throw error;
      }
    }

    // Verify final state
    console.log("\n4. Verifying final state...");
    const controllersAfter = await evc.getControllers(testSubAccount);
    console.log("   Controllers:", controllersAfter);
    console.log("   USDC vault is controller:", await evc.isControllerEnabled(testSubAccount, USDC_VAULT));
    console.log("   WETH vault is controller:", await evc.isControllerEnabled(testSubAccount, WETH_VAULT));

    // USDC vault should be disabled, WETH vault should be enabled
    expect(await evc.isControllerEnabled(testSubAccount, USDC_VAULT)).to.equal(false);
    expect(await evc.isControllerEnabled(testSubAccount, WETH_VAULT)).to.equal(true);
  });
});
