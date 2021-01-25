const { ethers } = require("hardhat");
const { sleep } = require("@gelatonetwork/core");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying ConditionMakerToAaveSafe to mainnet. Hit ctrl + c to abort"
    );
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  // the following will only deploy "ConditionMakerToAaveSafe"
  // if the contract was never deployed or if the code changed since last deployment
  await deploy("ConditionMakerToAaveSafe", {
    from: deployer,
    gasPrice: hre.network.config.gasPrice,
    log: hre.network.name === "mainnet" ? true : false,
    args: [
      (await ethers.getContract("InstaFeeCollector")).address,
      hre.network.config.OracleAggregator,
    ],
  });
};

module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["ConditionMakerToAaveSafe"];
module.exports.dependencies = ["InstaFeeCollector"];
