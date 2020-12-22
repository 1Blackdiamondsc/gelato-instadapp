const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

const setupETHAToETHB = require("../helpers/setupETHAToETHB");
const getInstaPoolV2Route = require("../../../../helpers/services/InstaDapp/getInstaPoolV2Route");
const feeRatio = require("../../../../helpers/services/InstaDapp/constants/feeRatio");
const feeCollector = require("../../../../helpers/services/InstaDapp/constants/feeCollector");

// This test showcases how to submit a task refinancing a Users debt position from
// Maker to Compound using Gelato
describe("Full Debt Bridge refinancing ETH-A => new ETH-B due to the closing of the previous ETHB vault", function () {
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

    const result = await setupETHAToETHB();

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
      conditions: [conditionMakerVaultUnsafeObj, conditionDestVaultWillBeSafe],
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

    //#region Closing of the vault B

    await contracts.dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ABI.ConnectMakerABI,
          functionname: "close",
          inputs: [vaultBId],
        }),
      ],
      wallets.userAddress, // origin
      {
        gasLimit: 5000000,
      }
    );

    //#endregion Closing of the vault B
  });

  // This test showcases the part which is automatically done by the Gelato Executor Network on mainnet
  // Bots constatly check whether the submitted task is executable (by calling canExec)
  // If the task becomes executable (returns "OK"), the "exec" function will be called
  // which will execute the debt refinancing on behalf of the user
  it("#3: Auto-refinance from ETH-A to ETH-B, if the Maker vault became unsafe.", async function () {
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

    //#endregion

    //#region Step 2 Executor execute the user's task

    // The market move make the vault unsafe, so the executor
    // will execute the user's task to make the user position safe
    // by a debt refinancing in compound.

    //#region EXPECTED OUTCOME
    let debtOnMakerBefore = await contracts.makerResolver.getMakerVaultRawDebt(
      vaultAId
    );

    const route = await getInstaPoolV2Route(
      contracts.DAI.address,
      debtOnMakerBefore,
      contracts.instaPoolResolver
    );

    if (route !== 1) {
      debtOnMakerBefore = await contracts.makerResolver.getMakerVaultDebt(
        vaultAId
      );
    }

    const feeCollectorBalanceB = await contracts.DAI.balanceOf(feeCollector);

    const vaultACollateral = await contracts.makerResolver.getMakerVaultCollateralBalance(
      vaultAId
    );

    //#endregion
    const executorBalanceBeforeExecution = await contracts.gelatoCore.executorStake(
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

    const cdps = await contracts.getCdps.getCdpsAsc(
      contracts.dssCdpManager.address,
      contracts.dsa.address
    );
    const oldVaultBId = vaultBId;
    vaultBId = String(cdps.ids[1]);
    expect(cdps.ids[1].isZero()).to.be.false;

    expect(oldVaultBId).to.be.not.equal(vaultBId);

    let debtOnMakerVaultB;
    if (route === 1) {
      debtOnMakerVaultB = await contracts.makerResolver.getMakerVaultRawDebt(
        vaultBId
      );
    } else {
      debtOnMakerVaultB = await contracts.makerResolver.getMakerVaultDebt(
        vaultBId
      );
    }

    const pricedCollateralOnVaultB = await contracts.makerResolver.getMakerVaultCollateralBalance(
      vaultBId
    );

    expect(
      await contracts.gelatoCore.executorStake(wallets.gelatoExecutorAddress)
    ).to.be.gt(executorBalanceBeforeExecution);

    // Estimated amount to borrowed token should be equal to the actual one read on compound contracts
    const expectedDebtOnMakerVaultB = debtOnMakerBefore
      .mul(feeRatio)
      .div(ethers.utils.parseUnits("1", 18));
    if (route === 1) {
      expect(expectedDebtOnMakerVaultB).to.be.lte(debtOnMakerVaultB);
    } else {
      expect(expectedDebtOnMakerVaultB).to.be.equal(debtOnMakerVaultB);
    }

    // Estimated amount of collateral should be equal to the actual one read on compound contracts
    expect(vaultACollateral).to.be.equal(pricedCollateralOnVaultB);

    const collateralOnMakerOnVaultAAfter = await contracts.makerResolver.getMakerVaultCollateralBalance(
      vaultAId
    ); // in Ether.
    const debtOnMakerOnVaultAAfter = await contracts.makerResolver.getMakerVaultRawDebt(
      vaultAId
    );

    // We should not have deposited ether or borrowed DAI on maker.
    expect(collateralOnMakerOnVaultAAfter).to.be.equal(ethers.constants.Zero);
    expect(debtOnMakerOnVaultAAfter).to.be.equal(ethers.constants.Zero);

    // DSA has maximum 2 wei DAI in it due to maths inaccuracies
    expect(await contracts.DAI.balanceOf(contracts.dsa.address)).to.be.equal(
      constants.MAKER_INITIAL_DEBT
    );

    //Fee collector balance check
    expect(await contracts.DAI.balanceOf(feeCollector)).to.be.equal(
      feeCollectorBalanceB.add(
        debtOnMakerBefore
          .mul(feeRatio)
          .div(ethers.utils.parseUnits("1", 18))
          .sub(debtOnMakerBefore)
      )
    );

    //#endregion
  });
});
