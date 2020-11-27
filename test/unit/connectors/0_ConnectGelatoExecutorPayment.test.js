const { expect } = require("chai");
const hre = require("hardhat");
const { ethers, deployments } = hre;

const ConnectMaker = require("../../../pre-compiles/ConnectMaker.json");
const GetCdps = require("../../../pre-compiles/GetCdps.json");
const DssCdpManager = require("../../../pre-compiles/DssCdpManager.json");
const ConnectBasic = require("../../../pre-compiles/ConnectBasic.json");
const InstaList = require("../../../pre-compiles/InstaList.json");
const InstaAccount = require("../../../pre-compiles/InstaAccount.json");
const InstaIndex = require("../../../pre-compiles/InstaIndex.json");
const IERC20 = require("../../../pre-compiles/IERC20.json");

describe("ConnectGelatoExecutorPayment Unit Test", function () {
  this.timeout(0);
  if (hre.network.name !== "hardhat") {
    console.error("Test Suite is meant to be run on hardhat only");
    process.exit(1);
  }

  let userWallet;
  let userAddress;

  let instaList;
  let instaIndex;
  let dai;
  let connectBasic;
  let getCdps;
  let dssCdpManager;

  let connectGelatoExecutorPayment;

  let dsa;
  let cdpId;

  beforeEach(async function () {
    // Deploy dependencies
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
    connectBasic = await ethers.getContractAt(
      ConnectBasic.abi,
      hre.network.config.ConnectBasic
    );
    getCdps = await ethers.getContractAt(
      GetCdps.abi,
      hre.network.config.GetCdps
    );
    dssCdpManager = await ethers.getContractAt(
      DssCdpManager.abi,
      hre.network.config.DssCdpManager
    );
    dai = await ethers.getContractAt(IERC20.abi, hre.network.config.DAI);

    // ========== Test Setup ============
    connectGelatoExecutorPayment = await ethers.getContract(
      "ConnectGelatoExecutorPayment"
    );

    // ========== Create DeFi Smart Account for User account ============

    const dsaAccountCount = await instaList.accounts();

    await expect(instaIndex.build(userAddress, 1, userAddress)).to.emit(
      instaIndex,
      "LogAccountCreated"
    );
    const dsaID = dsaAccountCount.add(1);
    await expect(await instaList.accounts()).to.be.equal(dsaID);

    // ========== Instantiate the DSA ============
    dsa = await ethers.getContractAt(
      InstaAccount.abi,
      await instaList.accountAddr(dsaID)
    );
  });

  it("#1: payExecutor should pay to Executor 300 dai", async function () {
    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "open",
          inputs: ["ETH-A"],
        }),
      ],
      userAddress
    );

    const cdps = await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address);
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

    expect(await dai.balanceOf(dsa.address)).to.be.equal(
      ethers.utils.parseEther("1000")
    );

    const executorDaiBalanceBefore = await dai.balanceOf(userAddress);

    await dsa.cast(
      [connectGelatoExecutorPayment.address],
      [
        await hre.run("abi-encode-withselector", {
          abi: (
            await hre.artifacts.readArtifact("ConnectGelatoExecutorPayment")
          ).abi,
          functionname: "payExecutor",
          inputs: [dai.address, ethers.utils.parseUnits("300", 18), 0, 0],
        }),
      ],
      userAddress
    );

    expect(await dai.balanceOf(userAddress)).to.be.equal(
      executorDaiBalanceBefore.add(ethers.utils.parseUnits("300", 18))
    );
  });

  it("#2: payExecutor should pay to Executor 1 ether", async function () {
    const executorBalanceBefore = await userWallet.getBalance();

    const { gasPrice, wait } = await dsa.cast(
      [connectBasic.address, connectGelatoExecutorPayment.address],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectBasic.abi,
          functionname: "deposit",
          inputs: [
            "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
            ethers.utils.parseEther("1"),
            0,
            "105",
          ],
        }),
        await hre.run("abi-encode-withselector", {
          abi: (
            await hre.artifacts.readArtifact("ConnectGelatoExecutorPayment")
          ).abi,
          functionname: "payExecutor",
          inputs: ["0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", 0, "105", 0],
        }),
      ],
      userAddress,
      {
        value: ethers.utils.parseEther("1"),
      }
    );

    const { gasUsed } = await wait();

    expect(await userWallet.getBalance()).to.be.eq(
      executorBalanceBefore.sub(gasUsed.mul(gasPrice))
    );
  });
});
