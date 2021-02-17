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

// #endregion

describe("ConditionMakerToCompoundSafe Unit Test", function () {
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

  let conditionMakerToCompoundSafe;
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
    conditionMakerToCompoundSafe = await ethers.getContract(
      "ConditionMakerToCompoundSafe"
    );

    compoundResolver = await ethers.getContract("CompoundResolver");
    oracleAggregator = new ethers.Contract(
      hre.network.config.OracleAggregator,
      [
        "function getExpectedReturnAmount(uint256 amountIn, address inToken, address outToken) external view returns (uint256 returnAmount, uint256 outTokenDecimals)",
      ],
      userWallet
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
    // 3 - Test if the anticipated position will be safe in Compound.

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

    const conditionData = await conditionMakerToCompoundSafe.getConditionData(
      dsa.address,
      ETH,
      cdpAId
    );
    expect(
      await conditionMakerToCompoundSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#2: _compoundPositionWillBeSafe should return false if the final position is not safe", async function () {
    expect(
      await compoundResolver.compoundPositionWouldBeSafe(
        dsa.address,
        ETH,
        ethers.utils.parseEther("10"),
        hre.network.config.DAI,
        ethers.utils.parseUnits("10200", 18)
      )
    ).to.be.false;
  });

  it("#3: _compoundPositionWillBeSafe should return true if the final position is safe due to previous deposit", async function () {
    const preAmountToDepo = ethers.utils.parseEther("1");
    await dsa.cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "deposit",
          inputs: [ETH, preAmountToDepo, 0, 0],
        }),
      ],
      userAddress,
      {
        value: preAmountToDepo,
      }
    );

    expect(
      await compoundResolver.compoundPositionWouldBeSafe(
        dsa.address,
        ETH,
        ethers.utils.parseEther("10"),
        hre.network.config.DAI,
        ethers.utils.parseUnits("10200", 18)
      )
    ).to.be.true;
  });

  it("#4: _compoundPositionWillBeSafe should return false if the final position is unsafe despite previous deposit", async function () {
    const preAmountToDepo = ethers.utils.parseEther("1");
    const preAmountToBor = await oracleAggregator.getExpectedReturnAmount(
      preAmountToDepo
        .mul(ethers.utils.parseUnits("745", 15))
        .div(ethers.utils.parseUnits("1", 18)),
      ETH,
      DAI.address
    );
    console.log(String(preAmountToBor));
    await dsa.cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function deposit(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "deposit",
          inputs: [ETH, preAmountToDepo, 0, 0],
        }),
      ],
      userAddress,
      {
        value: preAmountToDepo,
      }
    );

    await dsa.cast(
      [hre.network.config.ConnectCompound],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function borrow(address token, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "borrow",
          inputs: [DAI.address, preAmountToBor[0], 0, 0],
        }),
      ],
      userAddress
    );

    expect(
      await compoundResolver.compoundPositionWouldBeSafe(
        dsa.address,
        ETH,
        ethers.utils.parseEther("10"),
        hre.network.config.DAI,
        ethers.utils.parseUnits("10200", 18)
      )
    ).to.be.false;
  });
});
