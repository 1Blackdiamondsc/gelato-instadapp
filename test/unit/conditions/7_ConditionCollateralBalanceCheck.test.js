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

// #endregion

describe("ConditionCollateralBalanceCheck Unit Test", function () {
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

  let conditionCollateralBalanceCheck;

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

    // ========== Test Setup ============
    conditionCollateralBalanceCheck = await ethers.getContract(
      "ConditionCollateralBalanceCheck"
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

  it("#1: ok should return CollateralLockedNotEnough if the collateral locked on the vault is less than 10 ETH", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.

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

    const conditionData = await conditionCollateralBalanceCheck.getConditionData(
      dsa.address,
      cdpAId
    );
    expect(
      await conditionCollateralBalanceCheck.ok(0, conditionData, 0)
    ).to.be.equal("CollateralLockedNotEnough");
  });

  it("#2: ok should return OK if the collateral locked on the vault is greater or equal to 10 ETH", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.

    const amountToDeposit = ethers.utils.parseUnits("10", 18);

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

    const conditionData = await conditionCollateralBalanceCheck.getConditionData(
      dsa.address,
      cdpAId
    );
    expect(
      await conditionCollateralBalanceCheck.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });
});
