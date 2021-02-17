const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

const ConnectMaker = require("../../../pre-compiles/ConnectMaker.json");
const GetCdps = require("../../../pre-compiles/GetCdps.json");
const DssCdpManager = require("../../../pre-compiles/DssCdpManager.json");
const InstaIndex = require("../../../pre-compiles/InstaIndex.json");
const InstaList = require("../../../pre-compiles/InstaList.json");
const InstaAccount = require("../../../pre-compiles/InstaAccount.json");
const InstaPoolResolver = require("../../../artifacts/contracts/interfaces/InstaDapp/resolvers/IInstaPoolResolver.sol/IInstaPoolResolver.json");
const DAI = hre.network.config.DAI;

describe("FGelatoDebtBridge Unit Tests", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let userWallet;
  let userAddress;

  let fGelatoDebtBridgeMock;
  let instaPoolResolver;

  let cdpId;
  let getCdps;
  let dssCdpManager;
  let instaIndex;
  let instaList;
  let dsa;

  beforeEach(async function () {
    await deployments.fixture();

    [userWallet] = await ethers.getSigners();
    userAddress = await userWallet.getAddress();

    instaPoolResolver = await ethers.getContractAt(
      InstaPoolResolver.abi,
      hre.network.config.InstaPoolResolver
    );

    fGelatoDebtBridgeMock = await ethers.getContract("FGelatoDebtBridgeMock");

    instaIndex = await ethers.getContractAt(
      InstaIndex.abi,
      hre.network.config.InstaIndex
    );
    instaList = await ethers.getContractAt(
      InstaList.abi,
      hre.network.config.InstaList
    );
    getCdps = await ethers.getContractAt(
      GetCdps.abi,
      hre.network.config.GetCdps
    );
    dssCdpManager = await ethers.getContractAt(
      DssCdpManager.abi,
      hre.network.config.DssCdpManager
    );

    // Create DeFi Smart Account

    const dsaAccountCount = await instaList.accounts();

    await expect(instaIndex.build(userAddress, 1, userAddress)).to.emit(
      instaIndex,
      "LogAccountCreated"
    );
    const dsaID = dsaAccountCount.add(1);
    await expect(await instaList.accounts()).to.be.equal(dsaID);

    // Instantiate the DSA
    dsa = await ethers.getContractAt(
      InstaAccount.abi,
      await instaList.accountAddr(dsaID)
    );

    // Create/Deposit/Borrow a Vault
    const openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-A"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    let cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
    cdpId = String(cdps.ids[0]);

    expect(cdps.ids[0].isZero()).to.be.false;

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpId, ethers.utils.parseEther("10000"), 0, 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseEther("10000"),
      }
    );
    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpId, ethers.utils.parseUnits("2000", 18), 0, 0],
        }),
      ],
      userAddress
    );
  });

  it("getFlashLoanRoute should return 0 when dydx has enough liquidity", async function () {
    // const rData = instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18);

    expect(
      await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, cdpId, daiAmtToBorrow)
    ).to.be.equal(0);
  });

  // it("getFlashLoanRoute should return 2 when maker has enough liquidity and cheaper protocol didn't have enough liquidity", async function () {
  //   // const rData = await instaPoolResolver.getTokenLimit(DAI);
  //   const daiAmtToBorrow = (await compoundResolver.cTokenBalance(DAI)).add(ethers.utils.parseUnits("1000", 0));

  //   expect(
  //     await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, cdpId, daiAmtToBorrow)
  //   ).to.be.equal(2);
  // });

  it("getFlashLoanRoute should return 1 when compound has enough liquidity and cheaper protocol didn't have enough liquidity", async function () {
    const rData = await instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils.parseUnits("1000", 18).add(rData.maker);

    expect(
      await fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, cdpId, daiAmtToBorrow)
    ).to.be.equal(1);
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
    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpId, ethers.utils.parseUnits("1000000", 18), 0, 0],
        }),
      ],
      userAddress
    );

    const rData = await instaPoolResolver.getTokenLimit(DAI);
    const daiAmtToBorrow = ethers.utils
      .parseUnits("1000000", 18)
      .add(rData.aave); // Can fail if the different protocol increase their liquidity

    await expect(
      fGelatoDebtBridgeMock.getFlashLoanRoute(DAI, cdpId, daiAmtToBorrow)
    ).to.be.revertedWith("FGelatoDebtBridge._getFlashLoanRoute: illiquid");
  });
});
