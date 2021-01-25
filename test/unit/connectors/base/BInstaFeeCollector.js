const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

describe("instaFeeCollector Unit Test", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let noOwnerWallet;

  let instaFeeCollector;

  beforeEach(async function () {
    // Deploy contract dependencies
    await deployments.fixture();

    // Get Test Wallet for local testnet
    [, noOwnerWallet] = await ethers.getSigners();

    instaFeeCollector = await ethers.getContract("InstaFeeCollector");
  });

  it("#1: setFeeCollector should modify feeCollector when we call it as the owner", async function () {
    const feeCollector = await instaFeeCollector.feeCollector();
    expect(
      feeCollector,
      "feeCollector was not set on deployment"
    ).to.not.be.equal(ethers.constants.AddressZero);

    await instaFeeCollector.setFeeCollector(ethers.constants.AddressZero);

    expect(await instaFeeCollector.feeCollector()).to.be.eq(
      ethers.constants.AddressZero
    );
  });

  it("#2: setFee should modify minDebt when we call it as the owner and under 0.3% ether", async function () {
    expect(
      await instaFeeCollector.fee(),
      "fee was not set during deployment"
    ).to.not.be.eq(0);

    const newFee = ethers.utils.parseUnits("2", 15);

    await instaFeeCollector.setFee(newFee);

    expect(await instaFeeCollector.fee()).to.be.eq(newFee);
  });

  it("#3: setFeeCollector should revert when a no Owner address call it", async function () {
    await expect(
      instaFeeCollector
        .connect(noOwnerWallet)
        .setFeeCollector("0xb1DC62EC38E6E3857a887210C38418E4A17Da5B2")
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("4: setFee should revert when a no Owner address call it", async function () {
    await expect(
      instaFeeCollector
        .connect(noOwnerWallet)
        .setFee(ethers.utils.parseUnits("2", 15))
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("4: setFee should revert when we call it as the owner but with new fees value higher than 0.3% ether", async function () {
    await expect(
      instaFeeCollector.setFee(ethers.utils.parseUnits("4", 15))
    ).to.be.revertedWith(
      "InstaFeeCollector.setFee: New fee value is too high."
    );
  });
});
