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
const Vat = require("../../../artifacts/contracts/interfaces/dapps/Maker/IVat.sol/IVat.json");
const IERC20 = require("../../../pre-compiles/IERC20.json");

// #endregion

describe("ConditionIsDestVaultWillBeSafe Unit Test", function () {
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
  let vat;

  let conditionIsDestVaultWillBeSafe;

  let dsa;
  let cdpId;
  let ilk;
  let ethBIlk;
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
    vat = new ethers.Contract(await dssCdpManager.vat(), Vat.abi, userWallet);
    DAI = await ethers.getContractAt(IERC20.abi, hre.network.config.DAI);

    // ========== Test Setup ============
    conditionIsDestVaultWillBeSafe = await ethers.getContract(
      "ConditionIsDestVaultWillBeSafe"
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

    ethBIlk = ethers.utils.formatBytes32String("ETH-B");
    ilk = await vat.ilks(ethBIlk);
    amountToBorrow = ethers.utils.parseUnits("100", 18);
  });

  it("#1: ok should return DebtBridgeNotAffordable when the gas fees exceed a define amount", async function () {
    const conditionData = await conditionIsDestVaultWillBeSafe.getConditionData(
      cdpId,
      0,
      "ETH-B"
    );
    expect(
      await conditionIsDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#2: New Vault Case : isDestVaultWillBeSafe should return false when col is lower than borrow amount / spot", async function () {
    var amountOfColToDepo = amountToBorrow
      .mul(ilk[1])
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .sub(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilk[2]);

    expect(
      await conditionIsDestVaultWillBeSafe.isDestVaultWillBeSafe(
        0,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.false;
  });

  it("#3: New Vault Case : isDestVaultWillBeSafe should return true when col is greater than borrow amount / spot", async function () {
    let amountOfColToDepo = amountToBorrow
      .mul(ilk[1])
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .add(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilk[2]);

    expect(
      await conditionIsDestVaultWillBeSafe.isDestVaultWillBeSafe(
        0,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });

  it("#4: Old Vault Case : isDestVaultWillBeSafe should return false when col is lower than borrow amount / spot", async function () {
    const openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-B"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    const cdpIdB = String(
      (await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address)).ids[1]
    );

    let amountOfColToDepo = amountToBorrow
      .mul(ilk[1])
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .sub(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilk[2]);

    expect(
      await conditionIsDestVaultWillBeSafe.isDestVaultWillBeSafe(
        cdpIdB,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.false;
  });

  it("#5: Old Vault Case : isDestVaultWillBeSafe should return true when col is lower than borrow amount / spot", async function () {
    const openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-B"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    const cdpIdB = String(
      (await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address)).ids[1]
    );

    let amountOfColToDepo = amountToBorrow
      .mul(ilk[1])
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .add(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilk[2]);

    expect(
      await conditionIsDestVaultWillBeSafe.isDestVaultWillBeSafe(
        cdpIdB,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });

  it("#6: Old Vault Case with existing deposit : isDestVaultWillBeSafe should return true when col is lower than borrow amount / spot due to initial deposit on Vault B", async function () {
    const openVault = await hre.run("abi-encode-withselector", {
      abi: ConnectMaker.abi,
      functionname: "open",
      inputs: ["ETH-B"],
    });

    await dsa.cast([hre.network.config.ConnectMaker], [openVault], userAddress);

    const cdpIdB = String(
      (await getCdps.getCdpsAsc(dssCdpManager.address, dsa.address)).ids[1]
    );

    let amountOfColToDepo = amountToBorrow
      .mul(ilk[1])
      .div(ethers.utils.parseUnits("1", 27));
    const tenPercentOfAmountOfColToDepo = amountOfColToDepo.div(
      ethers.utils.parseUnits("10", 0)
    );
    amountOfColToDepo = amountOfColToDepo
      .sub(tenPercentOfAmountOfColToDepo)
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilk[2]);

    // Deposit For ETH-B Vault
    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpIdB, tenPercentOfAmountOfColToDepo, 0, 0],
        }),
      ],
      userAddress,
      {
        value: tenPercentOfAmountOfColToDepo,
      }
    );

    expect(
      await conditionIsDestVaultWillBeSafe.isDestVaultWillBeSafe(
        cdpIdB,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });
});
