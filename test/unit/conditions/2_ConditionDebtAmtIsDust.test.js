const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

// #region Contracts ABI

const ConnectMaker = require("../../../pre-compiles/ConnectMaker.json");
const GetCdps = require("../../../pre-compiles/GetCdps.json");
const DssCdpManager = require("../../../pre-compiles/DssCdpManager.json");
const InstaList = require("../../../pre-compiles/InstaList.json");
const InstaAccount = require("../../../pre-compiles/InstaAccount.json");
const InstaIndex = require("../../../pre-compiles/InstaIndex.json");
const IERC20 = require("../../../pre-compiles/IERC20.json");

// #endregion

describe("ConditionDebtAmtIsDust Unit Test", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let userWallet;
  let userAddress;

  let getCdps;
  let dssCdpManager;
  let instaList;
  let instaIndex;
  let DAI;

  let conditionDebtAmtIsDust;
  let makerResolver;

  let dsa;
  let cdpAId;
  let amountToBorrow;

  beforeEach(async function () {
    // Deploy contract dependencies
    await deployments.fixture();

    // Get Test Wallet for local testnet
    [userWallet] = await ethers.getSigners();
    userAddress = await userWallet.getAddress();

    // Hardhat default accounts prefilled with 100 ETH
    expect(await userWallet.getBalance()).to.be.gt(
      ethers.utils.parseEther("10")
    );

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
    DAI = await ethers.getContractAt(IERC20.abi, hre.network.config.DAI);

    // ========== Test Setup ============
    conditionDebtAmtIsDust = await ethers.getContract("ConditionDebtAmtIsDust");
    makerResolver = await ethers.getContract("MakerResolver");

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

    // Create/Deposit/Borrow a Vault for ETH-A
    let openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-A"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    let cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
    cdpAId = String(cdps.ids[0]);

    expect(cdps.ids[0].isZero()).to.be.false;
  });

  it("#1: ok should return Ok if we borrow more than the dust limit", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not have dust borrow.

    amountToBorrow = ethers.utils.parseUnits("2000", 18);
    const amountToDeposit = ethers.utils.parseUnits("4", 18);

    //#region Deposit

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpAId, amountToDeposit, 0, 0],
        }),
      ],
      userAddress,
      {
        value: amountToDeposit,
      }
    );

    //#endregion Deposit

    //#region Borrow

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpAId, amountToBorrow, 0, 0],
        }),
      ],
      userAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(amountToBorrow);

    //#endregion Borrow

    const conditionData = await conditionDebtAmtIsDust.getConditionData(
      dsa.address,
      cdpAId,
      0,
      "ETH-B"
    );
    expect(await conditionDebtAmtIsDust.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });

  it("#2: debtAmtIsDustExplicit should return false if we borrow less than the dust limit", async function () {
    amountToBorrow = ethers.utils.parseUnits("1000", 18); // dust limit is 2000 DAI (15 feb 2021) for ETH-B

    expect(await makerResolver.debtAmtIsDust(0, "ETH-B", amountToBorrow)).to.be
      .true;
  });
});
