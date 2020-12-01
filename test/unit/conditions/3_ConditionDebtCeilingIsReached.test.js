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

describe("ConditionDebtCeilingIsReached Unit Test", function () {
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

  let conditionDebtCeilingIsReached;

  let dsa;
  let cdpAId;
  let cdpBId;
  let amountToBorrow;

  beforeEach(async function () {
    // Deploy contract dependencies
    await deployments.fixture();

    // Get Test Wallet for local testnet
    [userWallet] = await ethers.getSigners();
    userAddress = await userWallet.getAddress();

    // Hardhat default accounts prefilled with 100 ETH
    expect(await userWallet.getBalance()).to.be.gt(
      ethers.utils.parseEther("900000") // amount needed to test debt ceiling.
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
    conditionDebtCeilingIsReached = await ethers.getContract(
      "ConditionDebtCeilingIsReached"
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

    // Create/Deposit/Borrow a Vault for ETH-B
    openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-B"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
    cdpBId = String(cdps.ids[1]);

    expect(cdps.ids[1].isZero()).to.be.false;
  });

  it("#1: ok should return Ok if for new vault (to open) the borrow amnount is less than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("500", 18);
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

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      0,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#2: ok should return DebtCeilingReached if for new vault (to open) the borrow amnount is greater than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("1000000", 18);
    const amountToDeposit = ethers.utils.parseUnits("200000", 18);

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

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      0,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("DebtCeilingReached");
  });

  it("#3: ok should return Ok if for old vault the borrow amnount is less than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("500", 18);
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

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#4: ok should return DebtCeilingReached if for old vault the borrow amnount is greater than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("1000000", 18);
    const amountToDeposit = ethers.utils.parseUnits("200000", 18);

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

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("DebtCeilingReached");
  });

  it("#5: ok should return Ok if for old vault (with debt) the borrow amnount is less than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("500", 18);
    const amountToDeposit = ethers.utils.parseUnits("2", 18);

    const amountToBorrowForVaultB = ethers.utils.parseUnits("500", 18);
    const amountToDepositForVaultB = ethers.utils.parseUnits("2", 18);

    //#region Deposit vault ETH-A

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

    //#endregion Deposit vault ETH-A

    //#region Borrow vault ETH-A

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

    //#endregion Borrow vault ETH-A

    //#region Deposit vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBId, amountToDepositForVaultB, 0, 0],
        }),
      ],
      userAddress,
      {
        value: amountToDepositForVaultB,
      }
    );

    //#endregion Deposit vault ETH-B

    //#region Borrow vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpBId, amountToBorrowForVaultB, 0, 0],
        }),
      ],
      userAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(
      amountToBorrowForVaultB.add(amountToBorrow)
    );

    //#endregion Borrow vault ETH-B

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#6: ok should return DebtCeilingReached if for old vault (with debt) the borrow amnount is greater than the remaining debt that can be borrowed", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if vault ETH-B will not be able to borrow due to debt ceiling.

    amountToBorrow = ethers.utils.parseUnits("1000000", 18);
    const amountToDeposit = ethers.utils.parseUnits("200000", 18);

    const amountToBorrowForVaultB = ethers.utils.parseUnits("500", 18);
    const amountToDepositForVaultB = ethers.utils.parseUnits("2", 18);

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

    //#region Deposit vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBId, amountToDepositForVaultB, 0, 0],
        }),
      ],
      userAddress,
      {
        value: amountToDepositForVaultB,
      }
    );

    //#endregion Deposit vault ETH-B

    //#region Borrow vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpBId, amountToBorrowForVaultB, 0, 0],
        }),
      ],
      userAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(
      amountToBorrowForVaultB.add(amountToBorrow)
    );

    //#endregion Borrow vault ETH-B

    const conditionData = await conditionDebtCeilingIsReached.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDebtCeilingIsReached.ok(0, conditionData, 0)
    ).to.be.equal("DebtCeilingReached");
  });
});
