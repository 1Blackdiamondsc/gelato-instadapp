const { expect } = require("chai");
const hre = require("hardhat");
const { deployments } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

const setupMAKERCOMPOUND = require("./helpers/setupMAKER-COMPOUND.mock");
const mockExecMAKERCOMPOUND = require("./helpers/services/exec-MAKER-COMPOUND.mock");

describe("Gas Measurements: Full Debt Bridge From Maker to Compound", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let contracts;
  let wallets;
  let constants;
  let ABI;

  // Payload Params for ConnectGelatoFullDebtBridgeFromMaker and ConditionMakerVaultUnsafe
  let vaultAId;

  let conditionMakerVaultUnsafeObj;
  let conditionDebtBridgeIsAffordableObj;

  // For TaskSpec and for Task
  let gelatoDebtBridgeSpells = [];
  let refinanceFromMakerToCompound;
  let gelatoExternalProvider;
  const expiryDate = 0;

  // Cross test var
  let taskReceipt;

  let mockRoute = 0;

  let gelatoGasPrice;

  before(async function () {
    gelatoGasPrice = await hre.run("fetchGelatoGasPrice");
  });

  beforeEach(async function () {
    // Reset back to a fresh forked state during runtime
    await deployments.fixture();

    const result = await setupMAKERCOMPOUND(mockRoute);

    wallets = result.wallets;
    contracts = result.contracts;
    vaultAId = result.vaultAId;
    gelatoDebtBridgeSpells = result.spells;

    ABI = result.ABI;
    constants = result.constants;

    expect(gelatoGasPrice).to.be.lte(constants.GAS_PRICE_CEIL);

    conditionMakerVaultUnsafeObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionMakerVaultUnsafe.address,
      data: await contracts.conditionMakerVaultUnsafe.getConditionData(
        vaultAId,
        contracts.priceOracleResolver.address,
        await hre.run("abi-encode-withselector", {
          abi: (await deployments.getArtifact("PriceOracleResolver")).abi,
          functionname: "getMockPrice",
          inputs: [wallets.userAddress],
        }),
        constants.MIN_COL_RATIO_MAKER
      ),
    });

    conditionDebtBridgeIsAffordableObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionDebtBridgeIsAffordable.address,
      data: await contracts.conditionDebtBridgeIsAffordable.getConditionData(
        vaultAId,
        constants.MAX_FEES_IN_PERCENT
      ),
    });

    // ======= GELATO TASK SETUP ======
    refinanceFromMakerToCompound = new GelatoCoreLib.Task({
      conditions: [
        conditionMakerVaultUnsafeObj,
        conditionDebtBridgeIsAffordableObj,
      ],
      actions: gelatoDebtBridgeSpells,
    });

    gelatoExternalProvider = new GelatoCoreLib.GelatoProvider({
      addr: wallets.gelatoProviderAddress, // Gelato Provider Address
      module: contracts.providerModuleDSA.address, // Gelato DSA module
    });

    await contracts.dsa.cast(
      [hre.network.config.ConnectAuth],
      [
        await hre.run("abi-encode-withselector", {
          abi: ABI.ConnectAuthABI,
          functionname: "add",
          inputs: [contracts.gelatoCore.address],
        }),
      ],
      wallets.userAddress
    );

    expect(await contracts.dsa.isAuth(contracts.gelatoCore.address)).to.be.true;
  });

  // Increment mockRoute in between tests
  afterEach(function () {
    mockRoute = mockRoute === 4 ? 0 : mockRoute + 1;
  });

  it("#1: execViaRoute0AndOpenVault", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    expect(mockRoute, "mockRoute mismatch").to.be.equal(0);

    // ======= GELATO TASK SETUP ======
    await expect(
      contracts.dsa.cast(
        [contracts.connectGelato.address], // targets
        [
          await hre.run("abi-encode-withselector", {
            abi: ABI.ConnectGelatoABI,
            functionname: "submitTask",
            inputs: [
              gelatoExternalProvider,
              refinanceFromMakerToCompound,
              expiryDate,
            ],
          }),
        ], // datas
        wallets.userAddress, // origin
        {
          gasLimit: 5000000,
        }
      )
    ).to.emit(contracts.gelatoCore, "LogTaskSubmitted");

    taskReceipt = new GelatoCoreLib.TaskReceipt({
      id: await contracts.gelatoCore.currentTaskReceiptId(),
      userProxy: contracts.dsa.address,
      provider: gelatoExternalProvider,
      tasks: [refinanceFromMakerToCompound],
      expiryDate,
    });

    await mockExecMAKERCOMPOUND(
      constants,
      contracts,
      wallets,
      mockRoute,
      taskReceipt,
      gelatoGasPrice
    );

    //#endregion
  });

  it("#2: execViaRoute1AndOpenVault", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    expect(mockRoute, "mockRoute mismatch").to.be.equal(1);

    // ======= GELATO TASK SETUP ======
    await expect(
      contracts.dsa.cast(
        [contracts.connectGelato.address], // targets
        [
          await hre.run("abi-encode-withselector", {
            abi: ABI.ConnectGelatoABI,
            functionname: "submitTask",
            inputs: [
              gelatoExternalProvider,
              refinanceFromMakerToCompound,
              expiryDate,
            ],
          }),
        ], // datas
        wallets.userAddress, // origin
        {
          gasLimit: 5000000,
        }
      )
    ).to.emit(contracts.gelatoCore, "LogTaskSubmitted");

    taskReceipt = new GelatoCoreLib.TaskReceipt({
      id: await contracts.gelatoCore.currentTaskReceiptId(),
      userProxy: contracts.dsa.address,
      provider: gelatoExternalProvider,
      tasks: [refinanceFromMakerToCompound],
      expiryDate,
    });

    await mockExecMAKERCOMPOUND(
      constants,
      contracts,
      wallets,
      mockRoute,
      taskReceipt,
      gelatoGasPrice
    );

    //#endregion
  });

  it("#3: execViaRoute2AndOpenVault", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    expect(mockRoute, "mockRoute mismatch").to.be.equal(2);

    // ======= GELATO TASK SETUP ======
    await expect(
      contracts.dsa.cast(
        [contracts.connectGelato.address], // targets
        [
          await hre.run("abi-encode-withselector", {
            abi: ABI.ConnectGelatoABI,
            functionname: "submitTask",
            inputs: [
              gelatoExternalProvider,
              refinanceFromMakerToCompound,
              expiryDate,
            ],
          }),
        ], // datas
        wallets.userAddress, // origin
        {
          gasLimit: 5000000,
        }
      )
    ).to.emit(contracts.gelatoCore, "LogTaskSubmitted");

    taskReceipt = new GelatoCoreLib.TaskReceipt({
      id: await contracts.gelatoCore.currentTaskReceiptId(),
      userProxy: contracts.dsa.address,
      provider: gelatoExternalProvider,
      tasks: [refinanceFromMakerToCompound],
      expiryDate,
    });

    await mockExecMAKERCOMPOUND(
      constants,
      contracts,
      wallets,
      mockRoute,
      taskReceipt,
      gelatoGasPrice
    );

    //#endregion
  });

  it("#4: execViaRoute3AndOpenVault", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    expect(mockRoute, "mockRoute mismatch").to.be.equal(3);

    // ======= GELATO TASK SETUP ======
    await expect(
      contracts.dsa.cast(
        [contracts.connectGelato.address], // targets
        [
          await hre.run("abi-encode-withselector", {
            abi: ABI.ConnectGelatoABI,
            functionname: "submitTask",
            inputs: [
              gelatoExternalProvider,
              refinanceFromMakerToCompound,
              expiryDate,
            ],
          }),
        ], // datas
        wallets.userAddress, // origin
        {
          gasLimit: 5000000,
        }
      )
    ).to.emit(contracts.gelatoCore, "LogTaskSubmitted");

    taskReceipt = new GelatoCoreLib.TaskReceipt({
      id: await contracts.gelatoCore.currentTaskReceiptId(),
      userProxy: contracts.dsa.address,
      provider: gelatoExternalProvider,
      tasks: [refinanceFromMakerToCompound],
      expiryDate,
    });

    await mockExecMAKERCOMPOUND(
      constants,
      contracts,
      wallets,
      mockRoute,
      taskReceipt,
      gelatoGasPrice
    );

    //#endregion
  });
});
