const { sleep } = require("@gelatonetwork/core");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log("\n\n Deploying MockCDAI to mainnet. Hit ctrl + c to abort");
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  const APY_2_PERCENT_IN_SECONDS = "1000000000627937192491029810";

  // the following will only deploy "MockCDAI"
  // if the contract was never deployed or if the code changed since last deployment
  await deploy("MockCDAI", {
    from: deployer,
    args: [APY_2_PERCENT_IN_SECONDS],
    gasPrice: hre.network.config.gasPrice,
    log: hre.network.name === "mainnet" ? true : false,
  });
};

module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["MockCDAI"];
