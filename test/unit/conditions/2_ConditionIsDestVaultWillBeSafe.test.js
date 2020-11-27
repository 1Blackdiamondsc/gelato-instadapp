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

describe("ConditionDestVaultWillBeSafe Unit Test", function () {
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

  let conditionDestVaultWillBeSafe;

  let dsa;
  let cdpAId;
  let cdpBId;
  let ilkA;
  let ilkB;
  let ethAIlk;
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
    conditionDestVaultWillBeSafe = await ethers.getContract(
      "ConditionDestVaultWillBeSafe"
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

    ethAIlk = ethers.utils.formatBytes32String("ETH-A");
    ilkA = await vat.ilks(ethAIlk);

    ethBIlk = ethers.utils.formatBytes32String("ETH-B");
    ilkB = await vat.ilks(ethBIlk);

    amountToBorrow = ethers.utils.parseUnits("100", 18);
  });

  it("#1: ok should return Ok when the gas fees didn't exceed a user define amount with vault creation", async function () {
    // Steps :
    // 1 - Deposit
    // 2 - Borrow
    // 3 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("4", 17)); // to be just above the liquidation ratio.

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      0,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#2: ok should return DestVaultWillNotBeSafe when the gas fees exceeded a user define amount with vault creation", async function () {
    // Steps :
    // 1 - Deposit
    // 2 - Borrow
    // 3 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("1", 16)); // to be just below the liquidation ratio.

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      0,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("DestVaultWillNotBeSafe");
  });

  it("#3: ok should return DestVaultWillNotBeSafe when the gas fees exceeded a user define amount", async function () {
    // Steps :
    // 1 - Deposit
    // 2 - Borrow
    // 3 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("1", 16)); // to be just below the liquidation ratio.

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("DestVaultWillNotBeSafe");
  });

  it("#4: ok should return Ok when the gas fees didn't exceed a user define amount", async function () {
    // Steps :
    // 1 - Deposit
    // 2 - Borrow
    // 3 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("4", 17)); // to be just above the liquidation ratio.

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#5: ok should return Ok when the gas fees didn't exceed a user define amount with deposit on vaultB", async function () {
    // Steps :
    // 1 - Deposit in Vault ETH-A
    // 2 - Deposit in Vault ETH-B just the minimum needed to make the all position of the user safe after debt bridge
    // 3 - Borrow
    // 4 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("1", 17)); // to be just above the liquidation ratio.

    //#region Deposit on Vault ETH-A

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

    //#region Deposit on Vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBId, ethers.utils.parseUnits("3", 17), 0, 0],
        }),
      ],
      userAddress,
      {
        value: amountToDeposit,
      }
    );

    //#endregion Deposit on Vault ETH-B

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#6: ok should return DestVaultWillNotBeSafe when the gas fees exceed a user define amount with closing the vaultB", async function () {
    // Steps :
    // 1 - Deposit in Vault ETH-A
    // 4 - Close Vault ETH-B
    // 5 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("1", 17)); // to be just above the liquidation ratio.

    //#region Deposit on Vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "close",
          inputs: [cdpBId],
        }),
      ],
      userAddress,
      {
        value: amountToDeposit,
      }
    );

    //#endregion Deposit on Vault ETH-B

    //#region Deposit on Vault ETH-A

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("DestVaultWillNotBeSafe");
  });

  it("#7: ok should return Ok when the gas fees didn't exceed a user define amount with closing the vaultB", async function () {
    // Steps :
    // 1 - Deposit in Vault ETH-A
    // 4 - Close Vault ETH-B
    // 5 - Test if vault ETH-B will be safe after debt bridge action
    const amountToDeposit = amountToBorrow
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkA[2]) // ilk[2] represent the liquidation ratio of ilk
      .add(ethers.utils.parseUnits("4", 17)); // to be just above the liquidation ratio.

    //#region Deposit on Vault ETH-B

    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "close",
          inputs: [cdpBId],
        }),
      ],
      userAddress,
      {
        value: amountToDeposit,
      }
    );

    //#endregion Deposit on Vault ETH-B

    //#region Deposit on Vault ETH-A

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

    const conditionData = await conditionDestVaultWillBeSafe.getConditionData(
      dsa.address,
      cdpAId,
      cdpBId,
      "ETH-B"
    );
    expect(
      await conditionDestVaultWillBeSafe.ok(0, conditionData, 0)
    ).to.be.equal("OK");
  });

  it("#8: New Vault Case : destVaultWillBeSafeExplicit should return false when col is lower than borrow amount / spot", async function () {
    let amountOfColToDepo = amountToBorrow
      .mul(ilkB[1]) // ilk[1] represent accumulated rates
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .sub(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkB[2]); // ilk[2] represent the liquidation ratio of ilk

    expect(
      await conditionDestVaultWillBeSafe.destVaultWillBeSafeExplicit(
        0,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.false;
  });

  it("#9: New Vault Case : destVaultWillBeSafeExplicit should return true when col is greater than borrow amount / spot", async function () {
    let amountOfColToDepo = amountToBorrow
      .mul(ilkB[1]) // ilk[1] represent accumulated rates
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .add(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkB[2]); // ilk[2] represent the liquidation ratio of ilk

    expect(
      await conditionDestVaultWillBeSafe.destVaultWillBeSafeExplicit(
        0,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });

  it("#10: Old Vault Case : destVaultWillBeSafeExplicit should return false when col is lower than borrow amount / spot", async function () {
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
      .mul(ilkB[1]) // ilk[1] represent accumulated rates
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .sub(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkB[2]); // ilk[2] represent the liquidation ratio of ilk

    expect(
      await conditionDestVaultWillBeSafe.destVaultWillBeSafeExplicit(
        cdpIdB,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.false;
  });

  it("#11: Old Vault Case : destVaultWillBeSafeExplicit should return true when col is lower than borrow amount / spot", async function () {
    let amountOfColToDepo = amountToBorrow
      .mul(ilkB[1]) // ilk[1] represent accumulated rates
      .div(ethers.utils.parseUnits("1", 27));
    amountOfColToDepo = amountOfColToDepo
      .add(amountOfColToDepo.div(ethers.utils.parseUnits("10", 0)))
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkB[2]); // ilk[2] represent the liquidation ratio of ilk

    expect(
      await conditionDestVaultWillBeSafe.destVaultWillBeSafeExplicit(
        cdpBId,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });

  it("#12: Old Vault Case with existing deposit : destVaultWillBeSafeExplicit should return true when col is lower than borrow amount / spot due to initial deposit on Vault B", async function () {
    let amountOfColToDepo = amountToBorrow
      .mul(ilkB[1]) // ilk[1] represent accumulated rates
      .div(ethers.utils.parseUnits("1", 27));
    const tenPercentOfAmountOfColToDepo = amountOfColToDepo.div(
      ethers.utils.parseUnits("10", 0)
    );
    amountOfColToDepo = amountOfColToDepo
      .sub(tenPercentOfAmountOfColToDepo)
      .mul(ethers.utils.parseUnits("1", 27))
      .div(ilkB[2]); // ilk[2] represent the liquidation ratio of ilk

    // Deposit For ETH-B Vault
    await dsa.cast(
      [hre.network.config.ConnectMaker],
      [
        await hre.run("abi-encode-withselector", {
          abi: ConnectMaker.abi,
          functionname: "deposit",
          inputs: [cdpBId, tenPercentOfAmountOfColToDepo, 0, 0],
        }),
      ],
      userAddress,
      {
        value: tenPercentOfAmountOfColToDepo,
      }
    );

    expect(
      await conditionDestVaultWillBeSafe.destVaultWillBeSafeExplicit(
        cdpBId,
        amountToBorrow,
        amountOfColToDepo,
        "ETH-B"
      )
    ).to.be.true;
  });
});
