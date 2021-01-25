const hre = require("hardhat");
const { ethers } = hre;
const { sleep } = require("@gelatonetwork/core");
const assert = require("assert");

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying ConnectGelatoDataMakerToAave to mainnet. Hit ctrl + c to abort"
    );
    console.log("❗ CONNECTOR DEPLOYMENT: VERIFY & HARDCODE CONNECTOR ID");
    console.log(`Connector Id: ${parseInt(process.env.CONNECTOR_ID)}`);
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

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
      "InstaConnectors",
      hre.network.config.InstaConnectors
    );
    const connectorLength = await instaConnectors.connectorLength();
    const connectorId = connectorLength.add(1);

    await deploy("ConnectGelatoDataMakerToAave", {
      from: deployer,
      args: [
        connectorId,
        hre.network.config.OracleAggregator,
        (await ethers.getContract("InstaFeeCollector")).address,
        (await ethers.getContract("ConnectGelatoDebtBridgeFee")).address,
      ],
    });

    await instaConnectors
      .connect(instaMaster)
      .enable(
        (await ethers.getContract("ConnectGelatoDataMakerToAave")).address
      );

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [await instaMaster.getAddress()],
    });
  } else {
    assert(process.env.CONNECTOR_ID);

    // the following will only deploy "ConnectGelatoDataMakerToAave"
    // if the contract was never deployed or if the code changed since last deployment
    await deploy("ConnectGelatoDataMakerToAave", {
      from: deployer,
      args: [
        parseInt(process.env.CONNECTOR_ID),
        hre.network.config.OracleAggregator,
        (await ethers.getContract("InstaFeeCollector")).address,
        (await ethers.getContract("ConnectGelatoDebtBridgeFee")).address,
      ],
      gasPrice: hre.network.config.gasPrice,
      log: true,
    });
  }
};

module.exports.skip = async (hre) => {
  if (hre.network.name === "mainnet") return true;
  if (hre.network.name !== "hardhat")
    return process.env.CONNECTOR_ID === undefined;
  return false;
};
module.exports.tags = ["ConnectGelatoDataMakerToAave"];
module.exports.dependencies = [
  "ConnectGelatoDebtBridgeFee",
  "InstaFeeCollector",
];
