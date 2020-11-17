const hre = require("hardhat");
const { ethers } = hre;
const { sleep } = require("@gelatonetwork/core");
const InstaConnector = require("../../pre-compiles/InstaConnectors.json");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "Deploying ConnectGelatoProviderPayment to mainnet. Hit ctrl + c to abort"
    );
    console.log("❗ CONNECTOR DEPLOYMENT: VERIFY & HARDCODE CONNECTOR ID");
    await sleep(10000);
  }
  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer, gelatoProvider } = await hre.getNamedAccounts();

  if (hre.network.name === "hardhat") {
    const deployerWallet = await ethers.provider.getSigner(deployer);
    const instaMaster = await ethers.provider.getSigner(
      hre.network.config.InstaMaster
    );

    await deployerWallet.sendTransaction({
      to: await instaMaster.getAddress(),
      value: ethers.utils.parseEther("0.1"),
    });

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [await instaMaster.getAddress()],
    });

    const instaConnectors = await hre.ethers.getContractAt(
      InstaConnector.abi,
      hre.network.config.InstaConnectors
    );
    const connectorLength = await instaConnectors.connectorLength();
    const connectorId = connectorLength.add(1);

    await deploy("ConnectGelatoProviderPayment", {
      from: deployer,
      args: [connectorId, gelatoProvider],
    });

    await instaConnectors
      .connect(instaMaster)
      .enable(
        (await ethers.getContract("ConnectGelatoProviderPayment")).address
      );

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [await instaMaster.getAddress()],
    });
  } else {
    // the following will only deploy "ConnectGelatoProviderPayment"
    // if the contract was never deployed or if the code changed since last deployment
    await deploy("ConnectGelatoProviderPayment", {
      from: deployer,
      args: [
        parseInt(process.env.ConnectGelatoProviderPaymentId),
        gelatoProvider,
      ],
      gasPrice: hre.network.config.gasPrice,
      nonce: 170,
      log: true,
    });
  }
};

module.exports.skip = async (hre) => {
  if (hre.network.name === "mainnet") return true;
  if (hre.network.name !== "hardhat")
    return process.env.ConnectGelatoProviderPaymentId === undefined;
  return false;
};
module.exports.tags = ["ConnectGelatoProviderPayment"];
