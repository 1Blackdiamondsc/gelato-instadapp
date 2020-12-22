const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

const InstaPoolResolver = require("../../../artifacts/contracts/interfaces/InstaDapp/resolvers/IInstaPoolResolver.sol/IInstaPoolResolver.json");
const DAI = hre.network.config.DAI;

describe("FGelatoDebtBridge Unit Tests", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let fGelatoDebtBridgeMock;
  let instaPoolResolver;
  beforeEach(async function () {
    await deployments.fixture();

    instaPoolResolver = await ethers.getContractAt(
      InstaPoolResolver.abi,
      hre.network.config.InstaPoolResolver
    );

    fGelatoDebtBridgeMock = await ethers.getContract("FGelatoDebtBridgeMock");
  });

  it("getFlashLoanRoute should return 0 when dydx has enough liquidity", async function () {
    // const rData = instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18);

    expect(
      await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)
    ).to.be.equal(0);
  });

  it("getFlashLoanRoute should return 1 when maker has enough liquidity and cheaper protocol didn't have enough liquidity", async function () {
    const rData = await instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18).add(rData.dydx);

    expect(
      await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)
    ).to.be.equal(1);
  });

  it("getFlashLoanRoute should return 2 when compound has enough liquidity and cheaper protocol didn't have enough liquidity", async function () {
    const rData = await instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18).add(rData.maker);

    expect(
      await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)
    ).to.be.equal(2);
  });

  // Seems aave has less liquidity than compound, is it always the case? If yes, why we should use this protocol.

  //   it("getFlashLoanRoute should return 3 when aave has enough liquidity and cheaper protocol didn't have enough liquidity", async function () {
  //     const rData = await instaPoolResolver.getTokenLimit(DAI);
  //     console.log(String(rData.dydx));
  //     console.log(String(rData.maker));
  //     console.log(String(rData.compound));
  //     console.log(String(rData.aave));
  //     const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18).add(rData.compound);

  //     expect(await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)).to.be.equal(3);
  //   })

  it("getFlashLoanRoute should revert with FGelatoDebtBridge._getFlashLoanRoute: illiquid", async function () {
    const rData = await instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils
      .parseUnits("1000000", 18)
      .add(rData.aave); // Can fail if the different protocol increase their liquidity

    await expect(
      fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)
    ).to.be.revertedWith("FGelatoDebtBridge._getFlashLoanRoute: illiquid");
  });
});
