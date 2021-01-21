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

const ETH_ETH_PRICEFEEDER = ethers.constants.AddressZero;
const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

// #endregion

describe("ConditionCanDoRefinance Unit Test", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let userWallet;
  let userAddress;
  let sndWallet;
  let sndUserAddress;

  let getCdps;
  let dssCdpManager;
  let instaList;
  let instaIndex;
  let DAI;

  let conditionCanDoRefinance;

  let dsa;
  let cdpAId;

  let secondUserDSA;
  let cdpBSecondUser;

  const aaveDepositDrain = ethers.utils.parseUnits("20000", 18);
  const makerDepositDrain = ethers.utils.parseUnits("100000", 18);
  let aTokenBalance;
  let availableBorowAmt;

  let aaveResolver;
  let makerResolver;

  beforeEach(async function () {
    // Deploy contract dependencies
    await deployments.fixture();

    // Get Test Wallet for local testnet
    [userWallet, sndWallet] = await ethers.getSigners();
    userAddress = await userWallet.getAddress();
    sndUserAddress = await sndWallet.getAddress();

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
    conditionCanDoRefinance = await ethers.getContract(
      "ConditionCanDoRefinance"
    );

    aaveResolver = await ethers.getContract("AaveResolver");
    makerResolver = await ethers.getContract("MakerResolver");

    // Create DeFi Smart Account For Second User

    let dsaAccountCount = await instaList.accounts();

    await expect(
      instaIndex.connect(sndWallet).build(sndUserAddress, 1, sndUserAddress)
    ).to.emit(instaIndex, "LogAccountCreated");

    let dsaID = dsaAccountCount.add(1);
    await expect(await instaList.accounts()).to.be.equal(dsaID);

    secondUserDSA = await ethers.getContractAt(
      InstaAccount.abi,
      await instaList.accountAddr(dsaID)
    );

    let openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-B"],
    });

    await secondUserDSA
      .connect(sndWallet)
      .cast([hre.network.config.ConnectMaker], [openVault], sndUserAddress);
    let cdps = await getCdps.getCdpsAsc(
      dssCdpManager.address,
      secondUserDSA.address
    );
    cdpBSecondUser = String(cdps.ids[0]);

    expect(cdps.ids[0].isZero()).to.be.false;

    // END Create DeFi Smart Account For Second User

    // Create DeFi Smart Account For User

    dsaAccountCount = await instaList.accounts();

    await expect(instaIndex.build(userAddress, 1, userAddress)).to.emit(
      instaIndex,
      "LogAccountCreated"
    );
    dsaID = dsaAccountCount.add(1);
    await expect(await instaList.accounts()).to.be.equal(dsaID);

    // Instantiate the DSA
    dsa = await ethers.getContractAt(
      InstaAccount.abi,
      await instaList.accountAddr(dsaID)
    );

    // Create/Deposit/Borrow a Vault for ETH-A
    openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-A"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
    cdpAId = String(cdps.ids[0]);

    expect(cdps.ids[0].isZero()).to.be.false;

    // aToken Balance

    aTokenBalance = await aaveResolver.getATokenUnderlyingBalance(DAI.address);
    availableBorowAmt = (await makerResolver.getMaxDebtAmt("ETH-B"))
      //.div(ethers.utils.parseUnits("1", 27))
      .sub(ethers.utils.parseUnits("100000", 18));

    // cToken Balance

    // ETH-B debt ceiling
  });

  it("#1: ok should return Ok if Aave has enough liquidity", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.
    let amountToBorrow = ethers.utils.parseUnits("500", 18);
    const amountToDeposit = ethers.utils.parseUnits("2", 18);
    // //#region Deposit
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
    // //#endregion Deposit
    // //#region Borrow
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
    // //#endregion Borrow
    const conditionData = await conditionCanDoRefinance.getConditionData(
      dsa.address,
      cdpAId,
      ETH,
      ETH_ETH_PRICEFEEDER,
      0,
      "ETH-B"
    );
    expect(await conditionCanDoRefinance.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });

  it("#2: ok should return Ok if Maker has enough liquidity", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.
    // 4 - Get All debt of Aave.
    let amountToBorrow = ethers.utils.parseUnits("500", 18);
    const amountToDeposit = ethers.utils.parseUnits("2", 18);
    // //#region Deposit
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
    // //#endregion Deposit
    // //#region Borrow
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

    // Drained Aave
    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "deposit",
          inputs: [ETH, aaveDepositDrain, 0, 0],
        }),
      ],
      userAddress,
      {
        value: aaveDepositDrain,
      }
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint rateMode, uint getId, uint setId) payable",
          ],
          functionname: "borrow",
          inputs: [
            DAI.address,
            aTokenBalance.sub(ethers.utils.parseUnits("200", 18)),
            2,
            0,
            0,
          ],
        }),
      ],
      userAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(amountToBorrow);
    // //#endregion Borrow
    const conditionData = await conditionCanDoRefinance.getConditionData(
      dsa.address,
      cdpAId,
      ETH,
      ETH_ETH_PRICEFEEDER,
      0,
      "ETH-B"
    );
    expect(await conditionCanDoRefinance.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });
  it("#3: ok should return Ok if Compound has enough liquidity", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.
    // 4 - Get All debt of Aave.
    let amountToBorrow = ethers.utils.parseUnits("500000", 18);
    const amountToDeposit = ethers.utils.parseUnits("2000", 18);
    // //#region Deposit
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
    // //#endregion Deposit
    // //#region Borrow
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

    // Drained Aave
    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "deposit",
          inputs: [ETH, aaveDepositDrain, 0, 0],
        }),
      ],
      userAddress,
      {
        value: aaveDepositDrain,
      }
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint rateMode, uint getId, uint setId) payable",
          ],
          functionname: "borrow",
          inputs: [DAI.address, aTokenBalance, 2, 0, 0],
        }),
      ],
      sndUserAddress
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBSecondUser, ethers.utils.parseUnits("100000", 18), 0, 0],
        }),
      ],
      sndUserAddress,
      {
        value: makerDepositDrain,
      }
    );

    // //#endregion Deposit
    // //#region Borrow
    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpBSecondUser, availableBorowAmt, 0, 0],
        }),
      ],
      sndUserAddress
    );
    expect(await DAI.balanceOf(dsa.address)).to.be.equal(amountToBorrow);
    // //#endregion Borrow
    const conditionData = await conditionCanDoRefinance.getConditionData(
      dsa.address,
      cdpAId,
      ETH,
      ETH_ETH_PRICEFEEDER,
      0,
      "ETH-B"
    );
    expect(await conditionCanDoRefinance.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });
  it("#4: ok should return CannotDoRefinance if even Compound hasn't enough liquidity", async function () {
    // Steps :
    // 1 - Deposit.
    // 2 - Borrow.
    // 3 - Test if Aave has enough liquidity for the futur borrow.
    // 4 - Get All debt of Aave.
    let amountToBorrow = ethers.utils.parseUnits("500000", 18);
    const amountToDeposit = ethers.utils.parseUnits("2000", 18);
    // //#region Deposit
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
    // //#endregion Deposit
    // //#region Borrow
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

    // Drained Aave
    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "deposit",
          inputs: [ETH, aaveDepositDrain, 0, 0],
        }),
      ],
      userAddress,
      {
        value: aaveDepositDrain,
      }
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectAaveV2],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint rateMode, uint getId, uint setId) payable",
          ],
          functionname: "borrow",
          inputs: [DAI.address, aTokenBalance, 2, 0, 0],
        }),
      ],
      sndUserAddress
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBSecondUser, ethers.utils.parseUnits("100000", 18), 0, 0],
        }),
      ],
      sndUserAddress,
      {
        value: makerDepositDrain,
      }
    );

    // //#endregion Deposit
    // //#region Borrow
    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "borrow",
          inputs: [cdpBSecondUser, availableBorowAmt, 0, 0],
        }),
      ],
      sndUserAddress
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectCompound.abi,
          functionname: "deposit",
          inputs: [ETH, ethers.utils.parseUnits("9000000", 18), 0, 0],
        }),
      ],
      sndUserAddress,
      {
        value: ethers.utils.parseUnits("9000000", 18),
      }
    );

    await secondUserDSA.connect(sndWallet).cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectCompound.abi,
          functionname: "borrow",
          inputs: [
            hre.network.config.DAI,
            ethers.utils.parseUnits("245000000", 18),
            0,
            0,
          ],
        }),
      ],
      sndUserAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(amountToBorrow);
    // //#endregion Borrow
    const conditionData = await conditionCanDoRefinance.getConditionData(
      dsa.address,
      cdpAId,
      ETH,
      ETH_ETH_PRICEFEEDER,
      0,
      "ETH-B"
    );
    expect(await conditionCanDoRefinance.ok(0, conditionData, 0)).to.be.equal(
      "CannotDoRefinance"
    );
  });
});
