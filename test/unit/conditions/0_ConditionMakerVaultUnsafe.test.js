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

const ORACLE_MAKER_ETH_USD = "ETH/USD-Maker-v1";
const ORACLE_MAKER_ETH_USD_ADDR = "0x729D19f657BD0614b4985Cf1D82531c67569197B";
const PRICE_ORACLE_MAKER_PAYLOAD = "0x57de26a4"; // IMakerOracle.read()

// #endregion

describe("ConditionMakerVaultUnsafe Unit Test", function () {
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

  let conditionMakerVaultUnsafe;
  let priceOracleResolver;

  let cdpId;
  let dsa;

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
    priceOracleResolver = await ethers.getContract("PriceOracleResolver");
    conditionMakerVaultUnsafe = await ethers.getContract(
      "ConditionMakerVaultUnsafe"
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
          inputs: [cdpId, ethers.utils.parseEther("10"), 0, 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseEther("10"),
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

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(
      ethers.utils.parseEther("2000")
    );
    // Add ETH/USD Maker Medianizer in the PriceOracleResolver

    await priceOracleResolver.addOracle(
      ORACLE_MAKER_ETH_USD,
      ORACLE_MAKER_ETH_USD_ADDR,
      PRICE_ORACLE_MAKER_PAYLOAD
    );
  });

  it("#1: ok should return MakerVaultNotUnsafe when the ETH/USD price is above the defined limit", async function () {
    const conditionData = await conditionMakerVaultUnsafe.getConditionData(
      cdpId,
      ORACLE_MAKER_ETH_USD_ADDR,
      PRICE_ORACLE_MAKER_PAYLOAD,
      ethers.utils.parseUnits("30", 17)
    );

    expect(await conditionMakerVaultUnsafe.ok(0, conditionData, 0)).to.be.equal(
      "MakerVaultNotUnsafe"
    );
  });

  it("#2: ok should return OK when the ETH/USD price is lower than the defined limit", async function () {
    const conditionData = await conditionMakerVaultUnsafe.getConditionData(
      cdpId,
      priceOracleResolver.address,
      await hre.run("abi-encode-withselector", {
        abi: (await hre.artifacts.readArtifact("PriceOracleResolver")).abi,
        functionname: "getMockPrice",
        inputs: [userAddress],
      }),
      ethers.utils.parseUnits("30", 17)
    );

    //#region Mock Part

    priceOracleResolver.setMockPrice(ethers.utils.parseUnits("299", 18));

    //#endregion

    expect(await conditionMakerVaultUnsafe.ok(0, conditionData, 0)).to.be.equal(
      "OK"
    );
  });
});
