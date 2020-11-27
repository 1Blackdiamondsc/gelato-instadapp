const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

const setupMakerToMaker = require("../helpers/setupMakerToMaker");

// This test showcases how to submit a task refinancing a Users debt position from
// Maker to Compound using Gelato
describe("Security: _cast function by example of ETHA-ETHB with disabled ConnectGelatoExecutorPayment", function () {
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
  let vaultBId;

  // For TaskSpec and for Task
  let gelatoDebtBridgeSpells = [];

  // Cross test var
  let taskReceipt;

  before(async function () {
    // Reset back to a fresh forked state during runtime
    await deployments.fixture();

    const result = await setupMakerToMaker();

    wallets = result.wallets;
    contracts = result.contracts;
    vaultAId = result.vaultAId;
    vaultBId = result.vaultBId;
    gelatoDebtBridgeSpells = result.spells;

    ABI = result.ABI;
    constants = result.constants;
  });

  it("#1: DSA authorizes Gelato to cast spells.", async function () {
    //#region User give authorization to gelato to use his DSA on his behalf.

    // Instadapp DSA contract give the possibility to the user to delegate
    // action by giving authorization.
    // In this case user give authorization to gelato to execute
    // task for him if needed.

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

    //#endregion
  });

  it("#2: User submits automated Debt Bridge task to Gelato via DSA", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    // User submit the refinancing task if market move against him.
    // So in this case if the maker vault go to the unsafe area
    // the refinancing task will be executed and the position
    // will be split on two position on maker and compound.
    // It will be done through a algorithm that will optimize the
    // total borrow rate.

    const conditionMakerVaultUnsafeObj = new GelatoCoreLib.Condition({
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

    const conditionDebtBridgeIsAffordableObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionDebtBridgeIsAffordable.address,
      data: await contracts.conditionDebtBridgeIsAffordable.getConditionData(
        vaultAId,
        constants.MAX_FEES_IN_PERCENT
      ),
    });

    const conditionDestVaultWillBeSafe = new GelatoCoreLib.Condition({
      inst: contracts.conditionDestVaultWillBeSafe.address,
      data: await contracts.conditionDestVaultWillBeSafe.getConditionData(
        contracts.dsa.address,
        vaultAId,
        vaultBId,
        "ETH-B"
      ),
    });

    // ======= GELATO TASK SETUP ======
    const refinanceFromEthAToBIfVaultUnsafe = new GelatoCoreLib.Task({
      conditions: [
        conditionMakerVaultUnsafeObj,
        conditionDebtBridgeIsAffordableObj,
        conditionDestVaultWillBeSafe,
      ],
      actions: gelatoDebtBridgeSpells,
    });

    const gelatoExternalProvider = new GelatoCoreLib.GelatoProvider({
      addr: wallets.gelatoProviderAddress, // Gelato Provider Address
      module: contracts.dsaProviderModule.address, // Gelato DSA module
    });

    const expiryDate = 0;

    await expect(
      contracts.dsa.cast(
        [contracts.connectGelato.address], // targets
        [
          await hre.run("abi-encode-withselector", {
            abi: ABI.ConnectGelatoABI,
            functionname: "submitTask",
            inputs: [
              gelatoExternalProvider,
              refinanceFromEthAToBIfVaultUnsafe,
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
      tasks: [refinanceFromEthAToBIfVaultUnsafe],
      expiryDate,
    });

    //#endregion
  });

  // This test showcases the part which is automatically done by the Gelato Executor Network on mainnet
  // Bots constatly check whether the submitted task is executable (by calling canExec)
  // If the task becomes executable (returns "OK"), the "exec" function will be called
  // which will execute the debt refinancing on behalf of the user
  it("#3: Test Case: Task execution with LogExecReverted due to disabled connector", async function () {
    // Steps
    // Step 1: Market Move against the user (Mock)
    // Step 2: Executor execute the user's task

    //#region Step 1 Market Move against the user (Mock)

    // Ether market price went from the current price to 250$

    const gelatoGasPrice = await hre.run("fetchGelatoGasPrice");
    expect(gelatoGasPrice).to.be.lte(constants.GAS_PRICE_CEIL);

    // TO DO: base mock price off of real price data
    await contracts.priceOracleResolver.setMockPrice(
      ethers.utils.parseUnits("400", 18)
    );

    expect(
      await contracts.gelatoCore
        .connect(wallets.executor)
        .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
    ).to.be.equal("ConditionNotOk:MakerVaultNotUnsafe");

    // TO DO: base mock price off of real price data
    await contracts.priceOracleResolver.setMockPrice(
      ethers.utils.parseUnits("250", 18)
    );

    expect(
      await contracts.gelatoCore
        .connect(wallets.executor)
        .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
    ).to.be.equal("OK");

    // SECURITY TEST CASE: we disable a connector to be called as part of the Task
    // and expect this to cause the _cast
    const instaConnectors = await hre.ethers.getContractAt(
      "InstaConnectors",
      hre.network.config.InstaConnectors
    );

    const { address: connectGelatoExecutorPayment } = await ethers.getContract(
      "ConnectGelatoExecutorPayment"
    );

    expect(await instaConnectors.isConnector([connectGelatoExecutorPayment])).to
      .be.true;

    const instaMaster = await ethers.provider.getSigner(
      hre.network.config.InstaMaster
    );

    await wallets.userWallet.sendTransaction({
      to: await instaMaster.getAddress(),
      value: ethers.utils.parseEther("0.1"),
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [await instaMaster.getAddress()],
    });

    await instaConnectors
      .connect(instaMaster)
      .disable(connectGelatoExecutorPayment);

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [await instaMaster.getAddress()],
    });

    // await expect(
    //   contracts.gelatoCore
    //     .connect(wallets.executor)
    //     .exec(taskReceipt, {
    //       gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
    //       gasLimit: constants.GAS_LIMIT,
    //     })
    // ).to.emit(contracts.gelatoCore, "LogExecReverted");

    const txResponse = await contracts.gelatoCore
      .connect(wallets.executor)
      .exec(taskReceipt, {
        gasPrice: gelatoGasPrice,
        gasLimit: constants.GAS_LIMIT,
      });
    const { blockHash } = await txResponse.wait();
    const logs = await ethers.provider.getLogs({ blockHash });
    expect(
      logs.some(
        (log) =>
          contracts.gelatoCore.interface.parseLog(log).args.reason ===
          "GelatoCore._exec:ConnectGelatoDataFullMakerToMaker._cast:not-connector"
      )
    ).to.be.true;
  });
});
