const { sleep } = require("@gelatonetwork/core");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying ChainlinkResolver to mainnet. Hit ctrl + c to abort"
    );
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  // the following will only deploy "ChainlinkResolver"
  // if the contract was never deployed or if the code changed since last deployment
  await deploy("ChainlinkResolver", {
    from: deployer,
    gasPrice: hre.network.config.gasPrice,
    log: hre.network.name === "mainnet" ? true : false,
  });
};

module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["ChainlinkResolver"];
