const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

const GelatoCoreLib = require("@gelatonetwork/core");

const setupETHAToAave = require("../helpers/setupETHAToAave");
const getInstaPoolV2Route = require("../../../../helpers/services/InstaDapp/getInstaPoolV2Route");
const getGasCost = require("../helpers/constants/getGasCostETHAToAave");
const feeRatio = require("../../../../helpers/services/InstaDapp/constants/feeRatio");
const feeCollector = require("../../../../helpers/services/InstaDapp/constants/feeCollector");
const {
  executorModule,
} = require("../../../../helpers/constants/gelatoConstants");

// This test showcases how to submit a task refinancing a Users debt position from
// Maker to Aave using Gelato
describe("Full Debt Bridge refinancing ETHA => Aave", function () {
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
  let vaultId;

  // For TaskSpec and for Task
  let gelatoDebtBridgeSpells = [];

  // Cross test var
  let taskReceipt;

  before(async function () {
    await deployments.fixture();

    const result = await setupETHAToAave();
    wallets = result.wallets;
    contracts = result.contracts;
    vaultId = result.vaultId;
    gelatoDebtBridgeSpells = result.spells;
    ABI = result.ABI;
    constants = result.constants;
  });

  it("#1: DSA give Authorization to Gelato to execute action his behalf.", async function () {
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

  it("#2: User submits Debt refinancing task if market move to Gelato via DSA", async function () {
    //#region User submit a Debt Refinancing task if market move against him

    // User submit the refinancing task if market move against him.
    // So in this case if the maker vault go to the unsafe area
    // the refinancing task will be executed and the position
    // will be split on two position on maker and aave.
    // It will be done through a algorithm that will optimize the
    // total borrow rate.

    const conditionMakerVaultUnsafeObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionMakerVaultUnsafe.address,
      data: await contracts.conditionMakerVaultUnsafe.getConditionData(
        vaultId,
        contracts.priceOracleResolver.address,
        await hre.run("abi-encode-withselector", {
          abi: (await deployments.getArtifact("PriceOracleResolver")).abi,
          functionname: "getMockPrice",
          inputs: [wallets.userAddress],
        }),
        constants.MIN_COL_RATIO_MAKER
      ),
    });

    const conditionDestPositionWillBeSafeObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionMakerToAaveSafe.address,
      data: await contracts.conditionMakerToAaveSafe.getConditionData(
        contracts.dsa.address,
        vaultId,
        constants.ETH
      ),
    });

    const conditionHasLiquidityObj = new GelatoCoreLib.Condition({
      inst: contracts.conditionMakerToAaveLiquid.address,
      data: await contracts.conditionMakerToAaveLiquid.getConditionData(
        vaultId
      ),
    });

    // ======= GELATO TASK SETUP ======
    const refinanceIfVaultUnsafe = new GelatoCoreLib.Task({
      conditions: [
        conditionMakerVaultUnsafeObj,
        conditionDestPositionWillBeSafeObj,
        conditionHasLiquidityObj,
      ],
      actions: gelatoDebtBridgeSpells,
    });

    const gelatoExternalProvider = new GelatoCoreLib.GelatoProvider({
      addr: wallets.gelatoProviderAddress, // Gelato Provider Address
      module: contracts.providerModuleDSA.address, // Gelato DSA module
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
              refinanceIfVaultUnsafe,
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
      tasks: [refinanceIfVaultUnsafe],
      expiryDate,
    });

    //#endregion
  });

  // This test showcases the part which is automatically done by the Gelato Executor Network on mainnet
  // Bots constatly check whether the submitted task is executable (by calling canExec)
  // If the task becomes executable (returns "OK"), the "exec" function will be called
  // which will execute the debt refinancing on behalf of the user
  it("#3: Use Maker Aave refinancing if the maker vault become unsafe after a market move.", async function () {
    // Steps
    // Step 1: Market Move against the user (Mock)
    // Step 2: Executor execute the user's task

    //#region Step 1 Market Move against the user (Mock)

    // Ether market price went from the current price to 250$

    const gelatoGasPrice = await hre.run("fetchGelatoGasPrice");
    expect(gelatoGasPrice).to.be.lte(constants.GAS_PRICE_CEIL);

    // TO DO: base mock price off of real price data
    await contracts.priceOracleResolver.setMockPrice(constants.BASE_MOCK_PRICE);

    expect(
      await contracts.gelatoCore
        .connect(wallets.executor)
        .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
    ).to.be.equal("ConditionNotOk:MakerVaultNotUnsafe");

    // TO DO: base mock price off of real price data
    await contracts.priceOracleResolver.setMockPrice(
      constants.BASE_MOCK_PRICE_OFF
    );

    expect(
      await contracts.gelatoCore
        .connect(wallets.executor)
        .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
    ).to.be.equal("OK");

    //#endregion

    //#region Step 2 Executor execute the user's task

    // The market move make the vault unsafe, so the executor
    // will execute the user's task to make the user position safe
    // by a debt refinancing in aave.

    //#region EXPECTED OUTCOME

    const debtOnMakerBefore = await contracts.makerResolver.getMakerVaultDebt(
      vaultId
    );

    const route = await getInstaPoolV2Route(
      contracts.DAI.address,
      debtOnMakerBefore,
      contracts.instaPoolResolver
    );

    const gasCost = await getGasCost(route);
    const feeCollectorBalanceBefore = await contracts.DAI.balanceOf(
      feeCollector
    );

    const gasFeesPaidFromDebt = (
      await contracts.oracleAggregator.getExpectedReturnAmount(
        ethers.BigNumber.from(gasCost).mul(gelatoGasPrice),
        constants.ETH,
        contracts.DAI.address
      )
    )[0];

    const vaultACollateral = await contracts.makerResolver.getMakerVaultCollateralBalance(
      vaultId
    );

    //#endregion

    const executorModuleDaiBalanceBeforeExecution = await contracts.DAI.balanceOf(
      executorModule
    );

    const executorStakeBeforeExecution = await contracts.gelatoCore.executorStake(
      wallets.gelatoExecutorAddress
    );

    await expect(
      contracts.gelatoCore.connect(wallets.executor).exec(taskReceipt, {
        gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
        gasLimit: constants.GAS_LIMIT,
      })
    ).to.emit(contracts.gelatoCore, "LogExecSuccess");
    // 🚧 For Debugging:
    // const txResponse2 = await contracts.gelatoCore
    //   .connect(wallets.executor)
    //   .exec(taskReceipt, {
    //     gasPrice: gelatoGasPrice,
    //     gasLimit: constants.GAS_LIMIT,
    //   });
    // const {blockHash} = await txResponse2.wait();
    // const logs = await ethers.provider.getLogs({blockHash});
    // const iFace = new ethers.utils.Interface(GelatoCoreLib.GelatoCore.abi);
    // for (const log of logs) {
    //   console.log(iFace.parseLog(log).args.reason);
    // }
    // await GelatoCoreLib.sleep(10000);

    expect(await contracts.DAI.balanceOf(executorModule)).to.be.equal(
      gasFeesPaidFromDebt.add(executorModuleDaiBalanceBeforeExecution)
    );

    expect(
      await contracts.gelatoCore.executorStake(wallets.gelatoExecutorAddress)
    ).to.be.gt(executorStakeBeforeExecution);

    // aave position of DSA on cDai and cEth
    const dsaAavePosition = await contracts.aaveResolver.getPosition(
      contracts.dsa.address
    );
    // Estimated amount to borrowed token should be equal to the actual one read on aave contracts
    const expectedDebtOnAave = debtOnMakerBefore
      .mul(feeRatio)
      .div(ethers.utils.parseUnits("1", 18))
      .add(gasFeesPaidFromDebt);

    const actualDebtOnAave = (
      await contracts.oracleAggregator.getExpectedReturnAmount(
        dsaAavePosition.totalBorrowsETH
          .div(ethers.utils.parseUnits("1", 8))
          .mul(dsaAavePosition.ethPriceInUsd),
        constants.ETH,
        hre.network.config.DAI
      )
    )[0];

    if (route === 1) {
      expect(expectedDebtOnAave).to.be.lte(actualDebtOnAave);
    } else {
      expect(expectedDebtOnAave.sub(actualDebtOnAave)).to.be.lt(
        ethers.utils.parseUnits("2", 0)
      );
    }

    // Estimated amount of collateral should be equal to the actual one read on aave contracts
    expect(vaultACollateral.sub(dsaAavePosition.totalCollateralETH)).to.be.lt(
      ethers.utils.parseUnits("1", 12)
    );

    // We should not have deposited ether or borrowed DAI on maker.
    expect(
      await contracts.makerResolver.getMakerVaultCollateralBalance(vaultId),
      "collateralOnMakerOnVaultAAfter"
    ).to.be.equal(ethers.constants.Zero); // in Ether.

    expect(
      await contracts.makerResolver.getMakerVaultDebt(vaultId),
      "debtOnMakerOnVaultAAfter"
    ).to.be.equal(ethers.constants.Zero);

    // DSA contain 1000 DAI
    expect(await contracts.DAI.balanceOf(contracts.dsa.address)).to.be.equal(
      constants.MAKER_INITIAL_DEBT
    );

    //Fee collector balance check
    expect(await contracts.DAI.balanceOf(feeCollector)).to.be.equal(
      feeCollectorBalanceBefore.add(
        debtOnMakerBefore
          .mul(feeRatio)
          .div(ethers.utils.parseUnits("1", 18))
          .sub(debtOnMakerBefore)
      )
    );

    //#endregion
  });
});
