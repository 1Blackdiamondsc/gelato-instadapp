// const { expect } = require("chai");
// const hre = require("hardhat");
// const { deployments, ethers } = hre;
// const GelatoCoreLib = require("@gelatonetwork/core");

// // #region Contracts ABI and Constants

// const InstaIndex = require("../../../../pre-compiles/InstaIndex.json");
// const InstaList = require("../../../../pre-compiles/InstaList.json");
// const InstaAccount = require("../../../../pre-compiles/InstaAccount.json");
// const ConnectGelato = require("../../../../pre-compiles/ConnectGelato.json");
// const ConnectMaker = require("../../../../pre-compiles/ConnectMaker.json");
// const ConnectCompound = require("../../../../pre-compiles/ConnectCompound.json");
// const ConnectInstaPool = require("../../../../pre-compiles/ConnectInstaPool.json");
// const ConnectAuth = require("../../../../pre-compiles/ConnectAuth.json");
// const ConnectGelatoFullDebtBridgeFromMakerABI = require("../artifacts/contracts/contracts/connectors/ConnectGelatoPartialDebtBridgeFromMaker.sol/ConnectGelatoPartialDebtBridgeFromMaker.json")
//   .abi;
// const ConnectGelatoExecutorPaymentABI = require("../../../../artifacts/contracts/contracts/connectors/ConnectGelatoExecutorPayment.sol/ConnectGelatoExecutorPayment.json")
//   .abi;
// const InstaConnector = require("../../../../pre-compiles/InstaConnectors.json");
// const DssCdpManager = require("../../../../pre-compiles/DssCdpManager.json");
// const GetCdps = require("../../../../pre-compiles/GetCdps.json");
// const IERC20 = require("../../../../pre-compiles/IERC20.json");
// const CTokenInterface = require("../../../../pre-compiles/CTokenInterface.json");
// const CompoundResolver = require("../../../../pre-compiles/InstaCompoundResolver.json");
// const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
// const GAS_LIMIT = "4000000";
// const GAS_PRICE_CEIL = ethers.utils.parseUnits("1000", "gwei");
// const WAD = ethers.utils.parseUnits("1", 18);

// // const ORACLE_MAKER_ETH_USD = "ETH/USD-Maker-v1";
// // const ORACLE_MAKER_ETH_USD_ADDR = "0x729D19f657BD0614b4985Cf1D82531c67569197B";
// // const PRICE_ORACLE_MAKER_PAYLOAD = "0x57de26a4"; // IMakerOracle.read()

// const MIN_COL_RATIO_MAKER = ethers.utils.parseUnits("3", 18);
// const MIN_COL_RATIO_B = ethers.utils.parseUnits("19", 17);

// // TO DO: make dynamic based on real time Collateral Price and Ratios
// const MAKER_INITIAL_ETH = ethers.utils.parseEther("10");
// const MAKER_INITIAL_DEBT = ethers.utils.parseUnits("1000", 18);

// // #endregion

// //#region Mock Math Function

// function wdiv(x, y) {
//   return x.mul(WAD).add(y.div(2)).div(y);
// }

// function wmul(x, y) {
//   return x.mul(y).add(WAD.div(2)).div(WAD);
// }

// function wCalcCollateralToWithdraw(
//   minColRatioOnMaker,
//   minColRatioOnPositionB,
//   collateralPrice,
//   pricedCollateral,
//   daiDebtOnMaker
// ) {
//   //#region CALCULATION REPLICATION

//   let expectedColToWithdraw = wmul(
//     wmul(minColRatioOnMaker, minColRatioOnPositionB),
//     daiDebtOnMaker
//   ); // doc ref : c_r x comp_r x d_2
//   expectedColToWithdraw = expectedColToWithdraw.sub(
//     wmul(minColRatioOnMaker, pricedCollateral)
//   ); // doc ref : c_r x comp_r x d_2 - c_r x e_2
//   expectedColToWithdraw = wdiv(
//     expectedColToWithdraw,
//     minColRatioOnPositionB.sub(minColRatioOnMaker)
//   ); // doc ref : (c_r x comp_r x d_2 - c_r x e_2)/ (comp_r - c_r)
//   expectedColToWithdraw = pricedCollateral.sub(expectedColToWithdraw); // doc ref : e_2 - ((c_r x comp_r x d_2 - c_r x e_2)/ (comp_r - c_r))

//   // Extra step to convert back to col type
//   expectedColToWithdraw = wdiv(expectedColToWithdraw, collateralPrice);

//   //#endregion
//   return expectedColToWithdraw;
// }

// function wCalcDebtToRepay(
//   minColRatioOnMaker,
//   minColRatioOnPositionB,
//   pricedCollateral,
//   daiDebtOnMaker
// ) {
//   //#region CALCULATION REPLICATION

//   let expectedBorToPayBack = wmul(
//     wmul(minColRatioOnMaker, minColRatioOnPositionB),
//     daiDebtOnMaker
//   ); // doc ref : c_r x comp_r x d_2
//   expectedBorToPayBack = expectedBorToPayBack.sub(
//     wmul(minColRatioOnMaker, pricedCollateral)
//   ); // doc ref : c_r x comp_r x d_2 - c_r x e_2
//   expectedBorToPayBack = wdiv(
//     expectedBorToPayBack,
//     minColRatioOnPositionB.sub(minColRatioOnMaker)
//   ); // doc ref : (c_r x comp_r x d_2 - c_r x e_2)/ (comp_r - c_r)
//   expectedBorToPayBack = wmul(
//     wdiv(ethers.utils.parseUnits("1", 18), minColRatioOnMaker),
//     expectedBorToPayBack
//   ); // doc ref : (1/c_r)((c_r x comp_r x d_2 - c_r x e_2)/ (comp_r - c_r))
//   expectedBorToPayBack = daiDebtOnMaker.sub(expectedBorToPayBack); // doc ref : d_2 - (1/c_r)((c_r x comp_r x d_2 - c_r x e_2)/ (comp_r - c_r))

//   //#endregion
//   return expectedBorToPayBack;
// }

// //#endregion

// describe("Debt Bridge with External Provider", function () {
//   this.timeout(0);
//   if (hre.network.name !== "hardhat") {
//     console.error("Test Suite is meant to be run on hardhat only");
//     process.exit(1);
//   }

//   // Wallet to use for local testing
//   let userWallet;
//   let userAddress;
//   let gelatoProvider;
//   let gelatoProviderAddress;
//   let executor;
//   let gelatoExecutorAddress;

//   // Deployed instances
//   let connectGelato;
//   let connectMaker;
//   let connectInstaPool;
//   let connectCompound;
//   let instaIndex;
//   let instaList;
//   let dssCdpManager;
//   let getCdps;
//   let DAI;
//   let gelatoCore;
//   let cDaiToken;
//   let cEthToken;
//   let instaMaster;
//   let instaConnectors;
//   let compoundResolver;

//   // Contracts to deploy and use for local testing
//   let conditionMakerVaultUnsafe;
//   let connectGelatoPartialDebtBridgeFromMaker;
//   let connectGelatoExecutorPayment;
//   let priceOracleResolver;
//   let providerModuleDSA;

//   // Creation during test
//   let dsa;

//   // Payload Params for ConnectGelatoPartialDebtBridgeFromMaker and ConditionMakerVaultUnsafe
//   let vaultId;

//   // For TaskSpec and for Task
//   let spells = [];

//   before(async function () {
//     // Get Test Wallet for local testnet
//     [
//       userWallet,
//       gelatoProvider,
//       executor,
//     ] = await ethers.getSigners();
//     userAddress = await userWallet.getAddress();
//     gelatoProviderAddress = await gelatoProvider.getAddress();
//     gelatoExecutorAddress = await executor.getAddress();

//     instaMaster = await ethers.provider.getSigner(
//       hre.network.config.InstaMaster
//     );

//     // Hardhat default accounts prefilled with 100 ETH
//     expect(await userWallet.getBalance()).to.be.gt(
//       ethers.utils.parseEther("10")
//     );

//     // ===== Get Deployed Contract Instance ==================
//     instaIndex = await ethers.getContractAt(
//       InstaIndex.abi,
//       hre.network.config.InstaIndex
//     );
//     instaList = await ethers.getContractAt(
//       InstaList.abi,
//       hre.network.config.InstaList
//     );
//     connectGelato = await ethers.getContractAt(
//       ConnectGelato.abi,
//       hre.network.config.ConnectGelato
//     );
//     connectMaker = await ethers.getContractAt(
//       ConnectMaker.abi,
//       hre.network.config.ConnectMaker
//     );
//     connectInstaPool = await ethers.getContractAt(
//       ConnectInstaPool.abi,
//       hre.network.config.ConnectInstaPool
//     );
//     connectCompound = await ethers.getContractAt(
//       ConnectCompound.abi,
//       hre.network.config.ConnectCompound
//     );
//     dssCdpManager = await ethers.getContractAt(
//       DssCdpManager.abi,
//       hre.network.config.DssCdpManager
//     );
//     getCdps = await ethers.getContractAt(
//       GetCdps.abi,
//       hre.network.config.GetCdps
//     );
//     DAI = await ethers.getContractAt(IERC20.abi, hre.network.config.DAI);
//     gelatoCore = await ethers.getContractAt(
//       GelatoCoreLib.GelatoCore.abi,
//       hre.network.config.GelatoCore
//     );
//     cDaiToken = await ethers.getContractAt(
//       CTokenInterface.abi,
//       hre.network.config.CDAI
//     );
//     cEthToken = await ethers.getContractAt(
//       CTokenInterface.abi,
//       hre.network.config.CETH
//     );
//     instaConnectors = await ethers.getContractAt(
//       InstaConnector.abi,
//       hre.network.config.InstaConnectors
//     );
//     compoundResolver = await ethers.getContractAt(
//       CompoundResolver.abi,
//       hre.network.config.CompoundResolver
//     );
//     // instaEvent = await ethers.getContractAt(
//     //     InstaEvent.abi,
//     //     hre.network.config.InstaEvent
//     // )

//     // ===== Deploy Needed Contract ==================

//     const PriceOracleResolver = await ethers.getContractFactory(
//       "PriceOracleResolver"
//     );
//     priceOracleResolver = await PriceOracleResolver.deploy();
//     await priceOracleResolver.deployed();

//     const ConditionMakerVaultUnsafe = await ethers.getContractFactory(
//       "ConditionMakerVaultUnsafe"
//     );
//     conditionMakerVaultUnsafe = await ConditionMakerVaultUnsafe.deploy();
//     await conditionMakerVaultUnsafe.deployed();

//     const ConnectGelatoPartialDebtBridgeFromMaker = await ethers.getContractFactory(
//       "ConnectGelatoPartialDebtBridgeFromMaker"
//     );
//     connectGelatoPartialDebtBridgeFromMaker = await ConnectGelatoPartialDebtBridgeFromMaker.deploy(
//       (await instaConnectors.connectorLength()).add(1)
//     );
//     await connectGelatoPartialDebtBridgeFromMaker.deployed();

//     const ConnectGelatoExecutorPayment = await ethers.getContractFactory(
//       "ConnectGelatoExecutorPayment"
//     );
//     connectGelatoExecutorPayment = await ConnectGelatoExecutorPayment.deploy(
//       (await instaConnectors.connectorLength()).add(2)
//     );
//     await connectGelatoExecutorPayment.deployed();

//     const ProviderModuleDSA = await ethers.getContractFactory(
//       "ProviderModuleDSA"
//     );
//     providerModuleDSA = await ProviderModuleDSA.deploy(
//       hre.network.config.GelatoCore,
//       connectGelatoExecutorPayment.address
//     );
//     await providerModuleDSA.deployed();

//     ///////////////////////////////////////////////////////////////////////////////////////////////////
//     ///////////////////////////////////////////////////////////////////////////////////////////////////
//     ///////////////////////////////   After Contracts Deployement : Setup   ///////////////////////////
//     ///////////////////////////////////////////////////////////////////////////////////////////////////
//     ///////////////////////////////////////////////////////////////////////////////////////////////////

//     // Gelato Testing environment setup.
//     // Step 1 : Add EUR/USD Maker Medianizer in the PriceOracleResolver
//     // Step 2 : Enable Debt Bridge Connector and Gelato Provider Payment Connector
//     // Step 3 : Executor Staking on Gelato
//     // Step 4 : Provider put some fund on gelato for paying future tasks executions
//     // Step 5 : Provider choose a executor
//     // Step 6 : Provider will add a module
//     // Step 7 : User create a DeFi Smart Account
//     // Step 8 : User open a Vault, put some ether on it and borrow some dai
//     // Step 9 : User give authorization to gelato to use his DSA on his behalf.
//     // Step 10 : Provider should whitelist task

//     //#region Step 1 Add EUR/USD Maker Medianizer in the PriceOracleResolver

//     // PriceOracleResolver is a price feeder aggregator
//     // You will be able to query price from multiple source through this aggregator
//     // For the demo we add the ETH/USD Medianizer to the aggregator
//     // MakerDAO price oracle are called Medianizer

//     // await priceOracleResolver.addOracle(
//     //   ORACLE_MAKER_ETH_USD,
//     //   ORACLE_MAKER_ETH_USD_ADDR,
//     //   PRICE_ORACLE_MAKER_PAYLOAD
//     // );

//     //#endregion

//     //#region Step 2 Enable Debt Bridge Connector and Gelato Provider Payment Connector

//     // Debt Bridge Connector is used during refinancing of debt
//     // This Connect help the user to split a position in one protocol.
//     // to 2 protocol in a safe way. Both debt position will be safe.

//     // Gelato Provider Payment Connector is used for paying the provider
//     // for task execution. So when futur task will be executed, through a self financing
//     // transaction (user will pay during the execution of the task) task will
//     // be executed. Improvind user experience.

//     await userWallet.sendTransaction({
//       to: hre.network.config.InstaMaster,
//       value: ethers.utils.parseEther("0.1"),
//     });

//     await hre.network.provider.request({
//       method: "hardhat_impersonateAccount",
//       params: [await instaMaster.getAddress()],
//     });

//     await instaConnectors
//       .connect(instaMaster)
//       .enable(connectGelatoPartialDebtBridgeFromMaker.address);

//     await instaConnectors
//       .connect(instaMaster)
//       .enable(connectGelatoExecutorPayment.address);

//     await hre.network.provider.request({
//       method: "hardhat_stopImpersonatingAccount",
//       params: [await instaMaster.getAddress()],
//     });

//     expect(
//       await instaConnectors.isConnector([
//         connectGelatoPartialDebtBridgeFromMaker.address,
//       ])
//     ).to.be.true;
//     expect(
//       await instaConnectors.isConnector([connectGelatoExecutorPayment.address])
//     ).to.be.true;

//     //#endregion

//     //#region Step 3  Executor Staking on Gelato

//     // For task execution provider will ask a executor to watch the
//     // blockchain for possible execution autorization given by
//     // the condition that user choose when submitting the task.
//     // And if all condition are meet executor will execute the task.
//     // For safety measure Gelato ask the executor to stake a minimum
//     // amount.

//     await gelatoCore.connect(executor).stakeExecutor({
//       value: await gelatoCore.minExecutorStake(),
//     });

//     expect(
//       await gelatoCore.isExecutorMinStaked(gelatoExecutorAddress)
//     ).to.be.true;

//     //#endregion

//     //#region Step 4 Provider put some fund on gelato for paying future tasks executions

//     // Provider put some funds in gelato system for paying the
//     // Executor when this one will execute task on behalf of the
//     // Provider. At each provider's task execution, some funds (approximatively
//     // the gas cost value) will be transfered to the Executor stake.

//     const TASK_AUTOMATION_FUNDS = await gelatoCore.minExecProviderFunds(
//       GAS_LIMIT,
//       GAS_PRICE_CEIL
//     );

//     await expect(
//       gelatoCore
//         .connect(gelatoProvider)
//         .provideFunds(gelatoProviderAddress, {
//           value: TASK_AUTOMATION_FUNDS,
//         })
//     ).to.emit(gelatoCore, "LogFundsProvided");

//     expect(await gelatoCore.providerFunds(gelatoProviderAddress)).to.be.equal(
//       TASK_AUTOMATION_FUNDS
//     );

//     //#endregion

//     //#region Step 5 Provider choose a executor

//     // Provider choose a executor who will execute futur task
//     // for the provider, it will be compensated by the provider.

//     await expect(
//       gelatoCore
//         .connect(gelatoProvider)
//         .providerAssignsExecutor(gelatoExecutorAddress)
//     ).to.emit(gelatoCore, "LogProviderAssignedExecutor");

//     expect(
//       await gelatoCore.executorByProvider(gelatoProviderAddress)
//     ).to.be.equal(gelatoExecutorAddress);

//     //#endregion

//     //#region Step 6 Provider will add a module

//     // By adding a module the provider will format future task's
//     // payload by adding some specificity like his address to the
//     // Payment connector for receiving payment of User.

//     await expect(
//       gelatoCore
//         .connect(gelatoProvider)
//         .addProviderModules([providerModuleDSA.address])
//     ).to.emit(gelatoCore, "LogProviderModuleAdded");

//     expect(
//       await gelatoCore
//         .connect(gelatoProvider)
//         .isModuleProvided(gelatoProviderAddress, providerModuleDSA.address)
//     ).to.be.true;

//     //#endregion

//     //#region Step 7 User create a DeFi Smart Account

//     // User create a Instadapp DeFi Smart Account
//     // who give him the possibility to interact
//     // with a large list of DeFi protocol through one
//     // Proxy account.

//     const dsaAccountCount = await instaList.accounts();

//     await expect(instaIndex.build(userAddress, 1, userAddress)).to.emit(
//       instaIndex,
//       "LogAccountCreated"
//     );
//     const dsaID = dsaAccountCount.add(1);
//     await expect(await instaList.accounts()).to.be.equal(dsaID);

//     // Instantiate the DSA
//     dsa = await ethers.getContractAt(
//       InstaAccount.abi,
//       await instaList.accountAddr(dsaID)
//     );

//     //#endregion

//     //#region Step 8 User open a Vault, put some ether on it and borrow some dai

//     // User open a maker vault
//     // He deposit 10 Eth on it
//     // He borrow a 1000 DAI

//     const openVault = await hre.run("abi-encode-withselector", {
//       abi: ConnectMaker.abi,
//       functionname: "open",
//       inputs: ["ETH-A"],
//     });

//     await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

//     const cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
//     vaultId = String(cdps.ids[0]);
//     expect(cdps.ids[0].isZero()).to.be.false;

//     await dsa.cast(
//       [hre.network.config.ConnectMaker],
//       [
//         await hre.run("abi-encode-withselector", {
//           abi: ConnectMaker.abi,
//           functionname: "deposit",
//           inputs: [vaultId, MAKER_INITIAL_ETH, 0, 0],
//         }),
//       ],
//       userAddress,
//       {
//         value: MAKER_INITIAL_ETH,
//       }
//     );

//     await dsa.cast(
//       [hre.network.config.ConnectMaker],
//       [
//         await hre.run("abi-encode-withselector", {
//           abi: ConnectMaker.abi,
//           functionname: "borrow",
//           inputs: [vaultId, MAKER_INITIAL_DEBT, 0, 0],
//         }),
//       ],
//       userAddress
//     );

//     expect(await DAI.balanceOf(dsa.address)).to.be.equal(MAKER_INITIAL_DEBT);

//     //#endregion

//     //#region Step 9 User give authorization to gelato to use his DSA on his behalf.

//     // Instadapp DSA contract give the possibility to the user to delegate
//     // action by giving authorization.
//     // In this case user give authorization to gelato to execute
//     // task for him if needed.

//     await dsa.cast(
//       [hre.network.config.ConnectAuth],
//       [
//         await hre.run("abi-encode-withselector", {
//           abi: ConnectAuth.abi,
//           functionname: "add",
//           inputs: [gelatoCore.address],
//         }),
//       ],
//       userAddress
//     );

//     expect(await dsa.isAuth(gelatoCore.address)).to.be.true;

//     //#endregion

//     //#region Step 10 Provider should whitelist task

//     // By WhiteList task, the provider can constrain the type
//     // of task the user can submitting.

//     //#region Actions

//     const debtBridgeCalculation = new GelatoCoreLib.Action({
//       addr: connectGelatoPartialDebtBridgeFromMaker.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectGelatoFullDebtBridgeFromMakerABI,
//         functionname: "savePartialRefinanceDataToMemory",
//         inputs: [
//           vaultId,
//           MIN_COL_RATIO_MAKER,
//           MIN_COL_RATIO_B,
//           priceOracleResolver.address,
//           await hre.run("abi-encode-withselector", {
//             abi: (await deployments.getArtifcat("PriceOracleResolver")).abi,
//             functionname: "getMockPrice",
//             inputs: [userAddress],
//           }),
//           0,
//           0,
//         ],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(debtBridgeCalculation);

//     const flashBorrow = new GelatoCoreLib.Action({
//       addr: connectInstaPool.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectInstaPool.abi,
//         functionname: "flashBorrow",
//         inputs: [hre.network.config.DAI, 0, "600", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(flashBorrow);

//     const paybackMaker = new GelatoCoreLib.Action({
//       addr: connectMaker.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectMaker.abi,
//         functionname: "payback",
//         inputs: [vaultId, 0, "601", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(paybackMaker);

//     const withdrawMaker = new GelatoCoreLib.Action({
//       addr: connectMaker.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectMaker.abi,
//         functionname: "withdraw",
//         inputs: [vaultId, 0, "602", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(withdrawMaker);

//     const depositCompound = new GelatoCoreLib.Action({
//       addr: connectCompound.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectCompound.abi,
//         functionname: "deposit",
//         inputs: [ETH, 0, "603", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(depositCompound);

//     const borrowCompound = new GelatoCoreLib.Action({
//       addr: connectCompound.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectCompound.abi,
//         functionname: "borrow",
//         inputs: [hre.network.config.DAI, 0, "604", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(borrowCompound);

//     const flashPayBack = new GelatoCoreLib.Action({
//       addr: connectInstaPool.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectInstaPool.abi,
//         functionname: "flashPayback",
//         inputs: [hre.network.config.DAI, 0, 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(flashPayBack);

//     const payExecutor = new GelatoCoreLib.Action({
//       addr: connectGelatoExecutorPayment.address,
//       data: await hre.run("abi-encode-withselector", {
//         abi: ConnectGelatoExecutorPaymentABI,
//         functionname: "payExecutor",
//         inputs: [gelatoProviderAddress, ETH, 0, "605", 0],
//       }),
//       operation: GelatoCoreLib.Operation.Delegatecall,
//     });

//     spells.push(payExecutor);

//     const gasPriceCeil = ethers.constants.MaxUint256;

//     const connectGelatoFullDebtBridgeFromMakerTaskSpec = new GelatoCoreLib.TaskSpec(
//       {
//         conditions: [conditionMakerVaultUnsafe.address],
//         actions: spells,
//         gasPriceCeil,
//       }
//     );

//     await expect(
//       gelatoCore
//         .connect(gelatoProvider)
//         .provideTaskSpecs([connectGelatoFullDebtBridgeFromMakerTaskSpec])
//     ).to.emit(gelatoCore, "LogTaskSpecProvided");

//     expect(
//       await gelatoCore
//         .connect(gelatoProvider)
//         .isTaskSpecProvided(
//           gelatoProviderAddress,
//           connectGelatoFullDebtBridgeFromMakerTaskSpec
//         )
//     ).to.be.equal("OK");

//     expect(
//       await gelatoCore
//         .connect(gelatoProvider)
//         .taskSpecGasPriceCeil(
//           gelatoProviderAddress,
//           await gelatoCore
//             .connect(gelatoProvider)
//             .hashTaskSpec(connectGelatoFullDebtBridgeFromMakerTaskSpec)
//         )
//     ).to.be.equal(gasPriceCeil);

//     //#endregion

//     //#endregion
//   });

//   it("#1: Use Maker Compound refinancing if the maker vault become unsafe after a market move.", async function () {
//     // User Actions
//     // Step 1: User submit a Debt Refinancing task if market move against him
//     // Step 2: Market Move against the user (Mock)
//     // Step 3: Executor execute the user's task

//     //#region Step 1 User submit a Debt Refinancing task if market move against him

//     // User submit the refinancing task if market move against him.
//     // So in this case if the maker vault go to the unsafe area
//     // the refinancing task will be executed and the position
//     // will be split on two position on maker and compound.
//     // It will be done through a algorithm that will optimize the
//     // total borrow rate.

//     const conditionMakerVaultUnsafeObj = new GelatoCoreLib.Condition({
//       inst: conditionMakerVaultUnsafe.address,
//       data: await conditionMakerVaultUnsafe.getConditionData(
//         vaultId,
//         priceOracleResolver.address,
//         await hre.run("abi-encode-withselector", {
//           abi: (await deployments.getArtifact("PriceOracleResolver")).abi,
//           functionname: "getMockPrice",
//           inputs: [userAddress],
//         }),
//         MIN_COL_RATIO_MAKER
//       ),
//     });

//     // ======= GELATO TASK SETUP ======
//     const refinanceIfVaultUnsafe = new GelatoCoreLib.Task({
//       conditions: [conditionMakerVaultUnsafeObj],
//       actions: spells,
//     });

//     const gelatoExternalProvider = new GelatoCoreLib.GelatoProvider({
//       addr: gelatoProviderAddress,
//       module: providerModuleDSA.address,
//     });

//     const expiryDate = 0;

//     await expect(
//       dsa.cast(
//         [connectGelato.address], // targets
//         [
//           await hre.run("abi-encode-withselector", {
//             abi: ConnectGelato.abi,
//             functionname: "submitTask",
//             inputs: [
//               gelatoExternalProvider,
//               refinanceIfVaultUnsafe,
//               expiryDate,
//             ],
//           }),
//         ], // datas
//         userAddress, // origin
//         {
//           gasLimit: 5000000,
//         }
//       )
//     ).to.emit(gelatoCore, "LogTaskSubmitted");

//     const taskReceipt = new GelatoCoreLib.TaskReceipt({
//       id: await gelatoCore.currentTaskReceiptId(),
//       userProxy: dsa.address,
//       provider: gelatoExternalProvider,
//       tasks: [refinanceIfVaultUnsafe],
//       expiryDate,
//     });

//     //#endregion

//     //#region Step 2 Market Move against the user (Mock)

//     // Ether market price went from the current price to 250$

//     const gelatoGasPrice = await hre.run("fetchGelatoGasPrice");
//     expect(gelatoGasPrice).to.be.lte(GAS_PRICE_CEIL);

//     // TO DO: base mock price off of real price data
//     await priceOracleResolver.setMockPrice(ethers.utils.parseUnits("400", 18));

//     expect(
//       await gelatoCore
//         .connect(executor)
//         .canExec(taskReceipt, GAS_LIMIT, gelatoGasPrice)
//     ).to.be.equal("ConditionNotOk:MakerVaultNotUnsafe");

//     // TO DO: base mock price off of real price data
//     await priceOracleResolver.setMockPrice(ethers.utils.parseUnits("250", 18));

//     expect(
//       await gelatoCore
//         .connect(executor)
//         .canExec(taskReceipt, GAS_LIMIT, gelatoGasPrice)
//     ).to.be.equal("OK");

//     //#endregion

//     //#region Step 3 Executor execute the user's task

//     // The market move make the vault unsafe, so the executor
//     // will execute the user's task to make the user position safe
//     // by a debt refinancing in compound.

//     //#region EXPECTED OUTCOME

//     const latestPrice = await priceOracleResolver.getMockPrice(userAddress);
//     const gasFeesPaidFromCol = ethers.utils
//       .parseUnits(String(1933090 + 19331 * 2), 0)
//       .mul(gelatoGasPrice);
//     const debtOnMakerBefore = await connectGelatoPartialDebtBridgeFromMaker.getMakerVaultDebt(
//       vaultId
//     );
//     const pricedCollateral = wmul(
//       (
//         await connectGelatoPartialDebtBridgeFromMaker.getMakerVaultCollateralBalance(
//           vaultId
//         )
//       ).sub(gasFeesPaidFromCol),
//       latestPrice
//     );

//     const expectedColWithdrawAmount = wCalcCollateralToWithdraw(
//       MIN_COL_RATIO_MAKER,
//       MIN_COL_RATIO_B,
//       latestPrice,
//       pricedCollateral,
//       debtOnMakerBefore
//     );

//     const expectedBorAmountToPayBack = wCalcDebtToRepay(
//       MIN_COL_RATIO_MAKER,
//       MIN_COL_RATIO_B,
//       pricedCollateral,
//       debtOnMakerBefore
//     );

//     //console.log(String(wdiv(pricedCollateral.sub(wmul(expectedColWithdrawAmount, latestPrice).add(gasFeesPaidFromCol)),debt.sub(expectedBorAmountToPayBack))));

//     //#endregion
//     const providerBalanceBeforeExecution = await gelatoProvider.getBalance();

//     await expect(
//       gelatoCore.connect(executor).exec(taskReceipt, {
//         gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
//         gasLimit: GAS_LIMIT,
//       })
//     ).to.emit(gelatoCore, "LogExecSuccess");

//     // 🚧 For Debugging:
//     // const txResponse2 = await gelatoCore
//     //   .connect(gelatoProvider)
//     //   .exec(taskReceipt, {
//     //     gasPrice: gelatoGasPrice,
//     //     gasLimit: GAS_LIMIT,
//     //   });
//     // const {blockHash} = await txResponse2.wait();
//     // const logs = await ethers.provider.getLogs({blockHash});
//     // const iFace = new ethers.utils.Interface(GelatoCoreLib.GelatoCore.abi);
//     // for (const log of logs) {
//     //   console.log(iFace.parseLog(log).args.reason);
//     // }
//     // await GelatoCoreLib.sleep(10000);

//     expect(await gelatoProvider.getBalance()).to.be.gt(
//       providerBalanceBeforeExecution
//     );

//     // compound position of DSA on cDai and cEth
//     const compoundPosition = await compoundResolver.getCompoundData(
//       dsa.address,
//       [cDaiToken.address, cEthToken.address]
//     );

//     // https://compound.finance/docs/ctokens#exchange-rate
//     // calculate cEth/ETH rate to convert back cEth to ETH
//     // for comparing with the withdrew Ether to the deposited one.
//     const exchangeRateCethToEth = (await cEthToken.getCash())
//       .add(await cEthToken.totalBorrows())
//       .sub(await cEthToken.totalReserves())
//       .div(await cEthToken.totalSupply());

//     // Estimated amount to borrowed token should be equal to the actual one read on compound contracts
//     expect(expectedBorAmountToPayBack).to.be.equal(
//       compoundPosition[0].borrowBalanceStoredUser
//     );

//     // Estimated amount of pricedCollateral should be equal to the actual one read on compound contracts
//     expect(
//       expectedColWithdrawAmount.sub(
//         compoundPosition[1].balanceOfUser.mul(exchangeRateCethToEth)
//       )
//     ).to.be.lt(ethers.utils.parseUnits("1", 12));

//     const debtOnMakerAfter = await connectGelatoPartialDebtBridgeFromMaker.getMakerVaultDebt(
//       vaultId
//     );
//     const collateralOnMakerAfter = await connectGelatoPartialDebtBridgeFromMaker.getMakerVaultCollateralBalance(
//       vaultId
//     ); // in Ether.

//     // Total Borrowed Amount on both protocol should equal to the initial borrowed amount on maker vault.
//     expect(
//       debtOnMakerAfter
//         .add(compoundPosition[0].borrowBalanceStoredUser)
//         .sub(MAKER_INITIAL_DEBT)
//     ).to.be.lte(ethers.utils.parseUnits("1", 0));
//     // Total Ether col on Maker and Compound (+ gasFeesPaidFromCol) should equal to the initial col on maker vault
//     expect(
//       compoundPosition[1].balanceOfUser
//         .mul(exchangeRateCethToEth)
//         .add(gasFeesPaidFromCol)
//         .add(collateralOnMakerAfter)
//         .sub(ethers.utils.parseEther("10"))
//     ).to.be.lt(ethers.utils.parseUnits("1", 12));

//     // Check Collaterization Ratio of Maker and Compound
//     expect(
//       wdiv(
//         wmul(
//           compoundPosition[1].balanceOfUser.mul(exchangeRateCethToEth),
//           latestPrice
//         ),
//         compoundPosition[0].borrowBalanceStoredUser
//       ).sub(MIN_COL_RATIO_MAKER)
//     ).to.be.lt(ethers.utils.parseUnits("1", 12));
//     expect(
//       wdiv(
//         wmul(
//           collateralOnMakerAfter,
//           await priceOracleResolver.getMockPrice(userAddress)
//         ),
//         debtOnMakerAfter
//       ).sub(MIN_COL_RATIO_MAKER)
//     ).to.be.lt(ethers.utils.parseUnits("1", 1));

//     // DSA contain 1000 DAI
//     expect(await DAI.balanceOf(dsa.address)).to.be.equal(MAKER_INITIAL_DEBT);

//     //#endregion
//   });
// });
