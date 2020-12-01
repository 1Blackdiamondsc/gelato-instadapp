const hre = require("hardhat");
const { ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

const InstaIndex = require("../../../pre-compiles/InstaIndex.json");
const InstaList = require("../../../pre-compiles/InstaList.json");
const ConnectMaker = require("../../../pre-compiles/ConnectMaker.json");
const ConnectCompound = require("../../../pre-compiles/ConnectCompound.json");
const ConnectInstaPool = require("../../../pre-compiles/ConnectInstaPool.json");

const InstaConnector = require("../../../pre-compiles/InstaConnectors.json");
const InstaMapping = require("../../../pre-compiles/InstaMapping.json");
const DssCdpManager = require("../../../pre-compiles/DssCdpManager.json");
const GetCdps = require("../../../pre-compiles/GetCdps.json");
const IERC20 = require("../../../pre-compiles/IERC20.json");
const CTokenInterface = require("../../../pre-compiles/CTokenInterface.json");
const CompoundResolver = require("../../../pre-compiles/InstaCompoundResolver.json");
const InstaPoolResolver = require("../../../artifacts/contracts/interfaces/InstaDapp/resolvers/IInstaPoolResolver.sol/IInstaPoolResolver.json");

module.exports = async function () {
  const instaMaster = await ethers.provider.getSigner(
    hre.network.config.InstaMaster
  );

  // ===== Get Deployed Contract Instance ==================
  const instaIndex = await ethers.getContractAt(
    InstaIndex.abi,
    hre.network.config.InstaIndex
  );
  const instaMapping = await ethers.getContractAt(
    InstaMapping.abi,
    hre.network.config.InstaMapping
  );
  const instaList = await ethers.getContractAt(
    InstaList.abi,
    hre.network.config.InstaList
  );
  const connectMaker = await ethers.getContractAt(
    ConnectMaker.abi,
    hre.network.config.ConnectMaker
  );
  const connectInstaPool = await ethers.getContractAt(
    ConnectInstaPool.abi,
    hre.network.config.ConnectInstaPool
  );
  const connectCompound = await ethers.getContractAt(
    ConnectCompound.abi,
    hre.network.config.ConnectCompound
  );
  const dssCdpManager = await ethers.getContractAt(
    DssCdpManager.abi,
    hre.network.config.DssCdpManager
  );
  const getCdps = await ethers.getContractAt(
    GetCdps.abi,
    hre.network.config.GetCdps
  );
  const DAI = await ethers.getContractAt(IERC20.abi, hre.network.config.DAI);
  const gelatoCore = await ethers.getContractAt(
    GelatoCoreLib.GelatoCore.abi,
    hre.network.config.GelatoCore
  );
  const cDaiToken = await ethers.getContractAt(
    CTokenInterface.abi,
    hre.network.config.CDAI
  );
  const cEthToken = await ethers.getContractAt(
    CTokenInterface.abi,
    hre.network.config.CETH
  );
  const instaConnectors = await ethers.getContractAt(
    InstaConnector.abi,
    hre.network.config.InstaConnectors
  );
  const compoundResolver = await ethers.getContractAt(
    CompoundResolver.abi,
    hre.network.config.CompoundResolver
  );
  const instaPoolResolver = await ethers.getContractAt(
    InstaPoolResolver.abi,
    hre.network.config.InstaPoolResolver
  );

  // ===== Get deployed contracts ==================
  const connectGelato = await ethers.getContract("ConnectGelato");
  const connectGelatoDataFullMakerToMaker = await ethers.getContract(
    "ConnectGelatoDataFullMakerToMaker"
  );
  const connectGelatoDataFullMakerToCompound = await ethers.getContract(
    "ConnectGelatoDataFullMakerToCompound"
  );
  const connectGelatoExecutorPayment = await ethers.getContract(
    "ConnectGelatoExecutorPayment"
  );

  const providerModuleDSA = await ethers.getContract("ProviderModuleDSA");

  const conditionMakerVaultUnsafe = await ethers.getContract(
    "ConditionMakerVaultUnsafe"
  );
  const conditionDebtBridgeIsAffordable = await ethers.getContract(
    "ConditionDebtBridgeIsAffordable"
  );
  const conditionDestVaultWillBeSafe = await ethers.getContract(
    "ConditionDestVaultWillBeSafe"
  );

  const priceOracleResolver = await ethers.getContract("PriceOracleResolver");
  const makerResolver = await ethers.getContract("MakerResolver");

  const mockDebtBridgeETHBExecutor = await ethers.getContract(
    "MockDebtBridgeETHBExecutor"
  );
  const mockConnectGelatoDataFullMakerToMaker = await ethers.getContract(
    "MockConnectGelatoDataFullMakerToMaker"
  );

  return {
    connectGelato,
    connectMaker,
    connectInstaPool,
    connectCompound,
    connectGelatoDataFullMakerToMaker,
    connectGelatoDataFullMakerToCompound,
    instaIndex,
    instaList,
    instaMapping,
    dssCdpManager,
    getCdps,
    DAI,
    gelatoCore,
    cDaiToken,
    cEthToken,
    instaMaster,
    instaConnectors,
    compoundResolver,
    conditionMakerVaultUnsafe,
    connectGelatoExecutorPayment,
    priceOracleResolver,
    dsa: ethers.constants.AddressZero,
    makerResolver,
    instaPoolResolver,
    providerModuleDSA,
    conditionDebtBridgeIsAffordable,
    mockDebtBridgeETHBExecutor,
    mockConnectGelatoDataFullMakerToMaker,
    conditionDestVaultWillBeSafe,
  };
};
