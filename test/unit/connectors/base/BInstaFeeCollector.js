const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

describe("BInstaFeeCollector Unit Test", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let noOwnerWallet;

  let bInstaFeeCollector;

  beforeEach(async function () {
    // Deploy contract dependencies
    await deployments.fixture();

    // Get Test Wallet for local testnet
    [, noOwnerWallet] = await ethers.getSigners();

    bInstaFeeCollector = await ethers.getContract(
      "ConnectGelatoDataFullMakerToAave"
    );
  });

  it("#1: setFeeCollector should modify feeCollector when we call it as the owner", async function () {
    const feeCollector = await bInstaFeeCollector.feeCollector();
    expect(
      feeCollector,
      "feeCollector was not set on deployment"
    ).to.not.be.equal(ethers.constants.AddressZero);

    await bInstaFeeCollector.setFeeCollector(ethers.constants.AddressZero);

    expect(await bInstaFeeCollector.feeCollector()).to.be.eq(
      ethers.constants.AddressZero
    );
  });

  it("#2: setMinCol should modify minCol when we call it as the owner", async function () {
    const minCol = await bInstaFeeCollector.minCol();
    expect(minCol, "min col was not set during deployment").to.not.be.eq(0);

    await bInstaFeeCollector.setMinCol(ethers.constants.Zero);

    expect(await bInstaFeeCollector.minCol()).to.be.eq(ethers.constants.Zero);
  });

  it("#3: setFeeCollector should revert when a no Owner address call it", async function () {
    await expect(
      bInstaFeeCollector
        .connect(noOwnerWallet)
        .setFeeCollector("0xb1DC62EC38E6E3857a887210C38418E4A17Da5B2")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("4: setMinCol should revert when a no Owner address call it", async function () {
    await expect(
      bInstaFeeCollector
        .connect(noOwnerWallet)
        .setMinCol(ethers.utils.parseUnits("10", 18))
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });
});
