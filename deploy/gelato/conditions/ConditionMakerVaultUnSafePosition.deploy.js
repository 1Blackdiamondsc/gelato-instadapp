const { sleep } = require("@gelatonetwork/core");
const { expect } = require("chai");
const hre = require("hardhat");
const { ethers } = hre;

module.exports = async (hre) => {
  if (hre.network.name === "mainnet") {
    console.log(
      "\n\n Deploying ConditionMakerVaultUnSafePosition to mainnet. Hit ctrl + c to abort"
    );
    await sleep(10000);
  }

  const { deployments } = hre;
  const { deploy } = deployments;
  const { deployer } = await hre.getNamedAccounts();

  if (hre.network.name === "hardhat") {
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [hre.network.config.OWNER_OSM],
    });

    const makerDeployer = await ethers.provider.getSigner(
      hre.network.config.OWNER_OSM
    );

    // Hack
    await deploy("SelfDestruct", {
      from: deployer,
      gasPrice: hre.network.config.gasPrice,
    });

    const selfDestruct = await ethers.getContract("SelfDestruct");

    await selfDestruct.selfdest(hre.network.config.OWNER_OSM, {
      value: ethers.utils.parseEther("1"),
    });

    // the following will only deploy "ConditionMakerVaultUnSafePosition"
    // if the contract was never deployed or if the code changed since last deployment.
    await deploy("ConditionMakerVaultUnSafePosition", {
      from: deployer,
    });

    const osm = await ethers.getContractAt(
      [
        "function kiss(address a)",
        "function bud(address a) view returns (uint256)",
      ],
      hre.network.config.ETH_OSM,
      makerDeployer
    );

    await osm.kiss(
      (await ethers.getContract("ConditionMakerVaultUnSafePosition")).address
    );

    expect(
      await osm.bud(
        (await ethers.getContract("ConditionMakerVaultUnSafePosition")).address
      )
    ).to.be.equal(ethers.utils.parseUnits("1", 0));

    await hre.network.provider.request({
      method: "hardhat_stopImpersonatingAccount",
      params: [await makerDeployer.getAddress()],
    });
  } else {
    // MAINNET DEPLOYMENT
    // the following will only deploy "ConditionMakerVaultUnSafePosition"
    // if the contract was never deployed or if the code changed since last deployment.
    await deploy("ConditionMakerVaultUnSafePosition", {
      from: deployer,
      gasPrice: hre.network.config.gasPrice,
      log: true,
    });
  }
};

module.exports.skip = async (hre) => {
  return hre.network.name === "mainnet" ? true : false;
};
module.exports.tags = ["ConditionMakerVaultUnSafePosition"];
