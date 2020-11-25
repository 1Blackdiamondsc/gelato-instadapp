const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

const InstaPoolResolver = require("../../../artifacts/contracts/interfaces/InstaDapp/resolvers/IInstaPoolResolver.sol/IInstaPoolResolver.json");
const getGasCostForFullRefinance = require("./../../helpers/services/gelato/getGasCostForFullRefinance");
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
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18).add(rData.aave);

    await expect(
      fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, daiAmtToBorrow)
    ).to.be.revertedWith("FGelatoDebtBridge._getFlashLoanRoute: illiquid");
  });

  it("getGasCostMakerToMaker should return 3142800 gas limit for route 0 (Dydx) and new vault", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(0, true);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(true, 0)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 3022800 gas limit for route 0 (Dydx)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(0);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(false, 0)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 3888600 gas limit for route 1 (maker) and new vault", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(1, true);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(true, 1)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 3768600 gas limit for route 1 (maker)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(1);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(false, 1)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 4885200 gas limit for route 2 (compound) and new vault", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(2, true);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(true, 2)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 4765200 gas limit for route 2 (compound)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(2);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(false, 2)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 5334000 gas limit for route 3 (aave) and new vault", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(3, true);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(true, 3)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should return 5214000 gas limit for route 3 (aave)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(3);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToMaker(false, 3)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToMaker should revert with invalid route index when the inputed route exceed 4", async function () {
    await expect(
      fGelatoDebtBridgeMock.getGasCostMakerToMaker(true, 5)
    ).to.be.revertedWith(
      "FGelatoDebtBridge._getGasCostMakerToMaker: invalid route index"
    );
  });

  it("getGasCostMakerToCompound should return 3022800 gas limit for route 0 (Dydx)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(0);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToCompound(0)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToCompound should return 3768600 gas limit for route 1 (Maker)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(1);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToCompound(1)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToCompound should return 4765200 gas limit for route 2 (Compound)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(2);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToCompound(2)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToCompound should return 5214000 gas limit for route 3 (Aave)", async function () {
    const expectedGasCost = await getGasCostForFullRefinance(3);
    expect(
      await fGelatoDebtBridgeMock.getGasCostMakerToCompound(3)
    ).to.be.equal(expectedGasCost);
  });

  it("getGasCostMakerToCompound should revert with invalid route index when the inputed route exceed 4", async function () {
    await expect(
      fGelatoDebtBridgeMock.getGasCostMakerToCompound(5)
    ).to.be.revertedWith(
      "FGelatoDebtBridge._getGasCostMakerToMaker: invalid route index"
    );
  });

  it("getRealisedDebt should increase the inputed uint by 0,5%", async function () {
    const debtToMove = ethers.utils.parseUnits("1000", 18);
    const expectedRealisedDebt = ethers.utils.parseUnits("1005", 18);

    expect(await fGelatoDebtBridgeMock.getRealisedDebt(debtToMove)).to.be.equal(
      expectedRealisedDebt
    );
  });
});
