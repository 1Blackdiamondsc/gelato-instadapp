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

describe("ConditionMakerVaultUnsafeOSM Unit Test", function () {
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

  let conditionMakerVaultUnsafeOSM;
  let oracleAggregator;

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
    conditionMakerVaultUnsafeOSM = await ethers.getContract(
      "ConditionMakerVaultUnsafeOSM"
    );

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
          inputs: [cdpId, ethers.utils.parseUnits("1000", 18), 0, 0],
        }),
      ],
      userAddress
    );

    expect(await DAI.balanceOf(dsa.address)).to.be.equal(
      ethers.utils.parseEther("1000")
    );
    // Add ETH/USD Maker Medianizer in the PriceOracleResolver
  });

  it("#1: ok should return MakerVaultNotUnsafe when the collateralization is above the defined limit", async function () {
    const conditionData = await conditionMakerVaultUnsafeOSM.getConditionData(
      cdpId,
      hre.network.config.ETH_OSM,
      await hre.run("abi-encode-withselector", {
        abi: ["function peep() view returns (bytes32,bool)"],
        functionname: "peep",
      }),
      ethers.utils.parseUnits("30", 17)
    );

    expect(
      await conditionMakerVaultUnsafeOSM.ok(0, conditionData, 0)
    ).to.be.equal("MakerVaultNotUnsafe");
  });

  it("#2: ok should return OK when the collateralization is lower than the defined limit", async function () {
    const amountToWithdraw = await oracleAggregator.getExpectedReturnAmount(
      (
        await oracleAggregator.getExpectedReturnAmount(
          ethers.utils.parseEther("10"),
          ETH,
          hre.network.config.DAI
        )
      )[0].sub(ethers.utils.parseUnits("1650", 18)),
      hre.network.config.DAI,
      ETH
    );
    const conditionData = await conditionMakerVaultUnsafeOSM.getConditionData(
      cdpId,
      hre.network.config.ETH_OSM,
      await hre.run("abi-encode-withselector", {
        abi: ["function peep() view returns (bytes32,bool)"],
        functionname: "peep",
      }),
      ethers.utils.parseUnits("30", 17)
    );

    //#region Mock Part

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: [
            "function withdraw(uint vault, uint amt, uint getId, uint setId) payable",
          ],
          functionname: "withdraw",
          inputs: [cdpId, amountToWithdraw[0], 0, 0],
        }),
      ],
      userAddress
    );

    //#endregion

    expect(
      await conditionMakerVaultUnsafeOSM.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });
});
