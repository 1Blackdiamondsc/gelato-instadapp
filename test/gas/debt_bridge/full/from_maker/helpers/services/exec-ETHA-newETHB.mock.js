// This test showcases the part which is automatically done by the Gelato Executor Network on mainnet
// Bots constatly check whether the submitted task is executable (by calling canExec)
// If the task becomes executable (returns "OK"), the "exec" function will be called
// which will execute the debt refinancing on behalf of the user

const hre = require("hardhat");
const { ethers } = hre;
const { expect } = require("chai");

module.exports = async function (
  constants,
  contracts,
  wallets,
  mockRoute,
  taskReceipt,
  gelatoGasPrice
) {
  // Steps
  // Step 1: Market Move against the user (Mock)
  // Step 2: Executor execute the user's task

  //#region Step 1 Market Move against the user (Mock)

  // Ether market price went from the current price to 250$

  // TO DO: base mock price off of real price data
  await contracts.priceOracleResolver.setMockPrice(
    ethers.utils.parseUnits("400", 18)
  );

  expect(
    await contracts.mockDebtBridgeETHBExecutor
      .connect(wallets.gelatoExecutorWallet)
      .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
  ).to.be.equal("ConditionNotOk:MakerVaultNotUnsafe");

  // TO DO: base mock price off of real price data
  await contracts.priceOracleResolver.setMockPrice(
    ethers.utils.parseUnits("250", 18)
  );

  expect(
    await contracts.mockDebtBridgeETHBExecutor
      .connect(wallets.gelatoExecutorWallet)
      .canExec(taskReceipt, constants.GAS_LIMIT, gelatoGasPrice)
  ).to.be.equal("OK");

  //#endregion

  //#region Step 2 Executor execute the user's task

  if (mockRoute === 0) {
    await expect(
      contracts.mockDebtBridgeETHBExecutor
        .connect(wallets.gelatoExecutorWallet)
        .execViaRoute0AndOpenVault(taskReceipt, {
          gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
          gasLimit: constants.GAS_LIMIT,
        })
    ).to.emit(contracts.gelatoCore, "LogExecSuccess");
  } else if (mockRoute === 1) {
    await expect(
      contracts.mockDebtBridgeETHBExecutor
        .connect(wallets.gelatoExecutorWallet)
        .execViaRoute1AndOpenVault(taskReceipt, {
          gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
          gasLimit: constants.GAS_LIMIT,
        })
    ).to.emit(contracts.gelatoCore, "LogExecSuccess");
  } else if (mockRoute === 2) {
    await expect(
      contracts.mockDebtBridgeETHBExecutor
        .connect(wallets.gelatoExecutorWallet)
        .execViaRoute2AndOpenVault(taskReceipt, {
          gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
          gasLimit: constants.GAS_LIMIT,
        })
    ).to.emit(contracts.gelatoCore, "LogExecSuccess");
  } else if (mockRoute === 3) {
    await expect(
      contracts.mockDebtBridgeETHBExecutor
        .connect(wallets.gelatoExecutorWallet)
        .execViaRoute3AndOpenVAult(taskReceipt, {
          gasPrice: gelatoGasPrice, // Exectutor must use gelatoGasPrice (Chainlink fast gwei)
          gasLimit: constants.GAS_LIMIT,
        })
    ).to.emit(contracts.gelatoCore, "LogExecSuccess");
  } else {
    throw new Error("Invalid mockRoute");
  }

  // 🚧 For Debugging:
  // const txResponse2 = await contracts.gelatoCore
  //   .connect(wallets.gelatoExecutorWallet)
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
};
