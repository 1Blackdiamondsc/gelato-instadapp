const { sleep } = require("@gelatonetwork/core");
const hre = require("hardhat");
const { ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying MockDebtBridgeETHBExecutor to mainnet. Hit ctrl + c to abort"
    );
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();
  const gelatoCore = await ethers.getContractAt(
    GelatoCoreLib.GelatoCore.abi,
    hre.network.config.GelatoCore
  );

  // the following will only deploy "MockDebtBridgeETHBExecutor"
  // if the contract was never deployed or if the code changed since last deployment
  await deploy("MockDebtBridgeETHBExecutor", {
    from: deployer,
    args: [gelatoCore.address],
    value: await gelatoCore.minExecutorStake(),
    gasPrice: hre.network.config.gasPrice,
    log: hre.network.name === "mainnet" ? true : false,
  });
};
module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["MockDebtBridgeETHBExecutor"];
