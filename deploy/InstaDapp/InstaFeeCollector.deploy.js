const { sleep } = require("@gelatonetwork/core");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying InstaFeeCollector to mainnet. Hit ctrl + c to abort"
    );
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer, instaFeeCollector } = await hre.getNamedAccounts();

  // the following will only deploy "InstaFeeCollector"
  // if the contract was never deployed or if the code changed since last deployment
  await deploy("InstaFeeCollector", {
    from: deployer,
    gasPrice: hre.network.config.gasPrice,
    args: [hre.ethers.utils.parseUnits("3", 15), instaFeeCollector],
    log: hre.network.name === "mainnet" ? true : false,
  });
};

module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["InstaFeeCollector"];
