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

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const UNI = "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984";

// #endregion

describe("ConditionMakerToAaveSafe Unit Test", function () {
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

  let conditionMakerToAaveSafe;
  let aaveResolver;
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
    conditionMakerToAaveSafe = await ethers.getContract(
      "ConditionMakerToAaveSafe"
    );
    aaveResolver = await ethers.getContract("AaveResolver");

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

  it("#1: ok should return Ok if the final position is safe", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if the anticipated position will be safe in Aave.

    let amountToBorrow = ethers.utils.parseUnits("2000", 18);
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

    const conditionData = await conditionMakerToAaveSafe.getConditionData(
      dsa.address,
      cdpAId,
      ETH
    );
    expect(await conditionMakerToAaveSafe.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });

  it("#2: isOverCollateralized should return false, if the position is undercollateralized", async function () {
    const amountToBorrow = await oracleAggregator.getExpectedReturnAmount(
      ethers.utils.parseUnits("87", 16),
      ETH,
      hre.network.config.DAI
    );

    expect(
      await aaveResolver.aavePositionWouldBeSafe(
        dsa.address,
        ethers.utils.parseEther("1"),
        ETH,
        amountToBorrow[0],
        oracleAggregator.address
      )
    ).to.be.false;
  });

  it("#3: isOverCollateralized should return true, if the position is overcollateralized", async function () {
    expect(
      await aaveResolver.aavePositionWouldBeSafe(
        dsa.address,
        ethers.utils.parseEther("1"),
        ETH,
        ethers.utils.parseUnits("400", 18),
        oracleAggregator.address
      )
    ).to.be.true;
  });

  it("#4: isOverCollateralized should return true, if the position is undercollateralized with initial position in Aave undercollateralized", async function () {
    await dsa.cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) external payable",
          ],
          functionname: "deposit",
          inputs: [ETH, ethers.utils.parseEther("1"), 0, 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseEther("1"),
      }
    );

    await dsa.cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint rateMode, uint getId, uint setId) external payable",
          ],
          functionname: "borrow",
          inputs: [UNI, ethers.utils.parseUnits("50", 18), 2, 0, 0],
        }),
      ],
      userAddress
    );

    expect(
      await aaveResolver.aavePositionWouldBeSafe(
        dsa.address,
        ethers.utils.parseEther("1"),
        ETH,
        ethers.utils.parseUnits("580", 18),
        oracleAggregator.address
      )
    ).to.be.true;
  });

  it("#5: isOverCollateralized should return false, if the position is undercollateralized with initial position in Aave", async function () {
    await dsa.cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) external payable",
          ],
          functionname: "deposit",
          inputs: [ETH, ethers.utils.parseEther("1"), 0, 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseEther("1"),
      }
    );

    let amountToBorrow = await oracleAggregator.getExpectedReturnAmount(
      ethers.utils.parseUnits("80", 16),
      ETH,
      UNI
    );

    await dsa.cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint rateMode, uint getId, uint setId) external payable",
          ],
          functionname: "borrow",
          inputs: [UNI, amountToBorrow[0], 2, 0, 0],
        }),
      ],
      userAddress
    );

    amountToBorrow = await oracleAggregator.getExpectedReturnAmount(
      ethers.utils.parseUnits("87", 16),
      ETH,
      hre.network.config.DAI
    );

    expect(
      await aaveResolver.aavePositionWouldBeSafe(
        dsa.address,
        ethers.utils.parseEther("1"),
        ETH,
        amountToBorrow[0],
        oracleAggregator.address
      )
    ).to.be.false;
  });
});
