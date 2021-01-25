const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;

// #region Contracts ABI

const ConnectMaker = require("../../../pre-compiles/ConnectMaker.json");
const ConnectCompound = require("../../../pre-compiles/ConnectCompound.json");
const GetCdps = require("../../../pre-compiles/GetCdps.json");
const DssCdpManager = require("../../../pre-compiles/DssCdpManager.json");
const InstaList = require("../../../pre-compiles/InstaList.json");
const InstaAccount = require("../../../pre-compiles/InstaAccount.json");
const InstaIndex = require("../../../pre-compiles/InstaIndex.json");
const IERC20 = require("../../../pre-compiles/IERC20.json");

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// #endregion

describe("ConditionMakerToCompoundLiquid Unit Test", function () {
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

  let conditionMakerToCompoundLiquid;
  let compoundResolver;
  let oracleAggregator;

  let dsa;
  let cdpAId;

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
    conditionMakerToCompoundLiquid = await ethers.getContract(
      "ConditionMakerToCompoundLiquid"
    );

    compoundResolver = await ethers.getContract("CompoundResolver");

    oracleAggregator = await ethers.getContractAt(
      "IOracleAggregator",
      hre.network.config.OracleAggregator
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

  it("#1: ok should return Ok if Compound has enough liquidity for the futur borrow", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Compound has enough liquidity for the futur borrow.

    let amountToBorrow = ethers.utils.parseUnits("500", 18);
    const amountToDeposit = ethers.utils.parseUnits("2", 18);

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

    const conditionData = await conditionMakerToCompoundLiquid.getConditionData(
      cdpAId
    );
    expect(
      await conditionMakerToCompoundLiquid.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#2: ok should return CompoundHasNotEnoughLiquidity if Compound hasn't enough liquidity for the futur borrow", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Compound has enough liquidity for the futur borrow.

    // const amountToBorrow = ethers.utils.parseUnits("10000000", 18); // for Block 11423903 the amount of DAI in Compound is ~1.5 millions dollars
    const amountToDeposit = ethers.utils.parseUnits("1", 18);

    const amountToBorrow = (
      await oracleAggregator.getExpectedReturnAmount(
        ethers.utils.parseUnits("65", 16),
        ETH,
        hre.network.config.DAI
      )
    )[0];

    await dsa.cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectCompound.abi,
          functionname: "deposit",
          inputs: [ETH, ethers.utils.parseUnits("9000000", 18), 0, 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseUnits("9000000", 18),
      }
    );

    const compoundBorrowBefore = (
      await compoundResolver.cTokenBalance(hre.network.config.DAI)
    ).sub(ethers.utils.parseUnits("100", 18));

    await dsa.cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectCompound.abi,
          functionname: "borrow",
          inputs: [hre.network.config.DAI, compoundBorrowBefore, 0, 0],
        }),
      ],
      userAddress
    );

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

    expect(
      (await DAI.balanceOf(dsa.address)).sub(compoundBorrowBefore)
    ).to.be.equal(amountToBorrow);

    //#endregion Borrow

    const conditionData = await conditionMakerToCompoundLiquid.getConditionData(
      cdpAId
    );
    expect(
      await conditionMakerToCompoundLiquid.ok(0, conditionData, 0)
    ).to.be.equal("CompoundHasNotEnoughLiquidity");
  });
});
