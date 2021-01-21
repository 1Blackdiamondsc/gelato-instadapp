const getWallets = require("../../../../../helpers/services/getWallets");
const getContracts = require("../../../../../helpers/services/getContracts");
const constants = require("../../../../../integration/debt_bridge/from_maker/helpers/constants");
const provideFunds = require("../../../../../helpers/services/gelato/provideFunds");
const providerAssignsExecutor = require("../../../../../helpers/services/gelato/providerAssignsExecutor");
const addProviderModuleDSA = require("../../../../../helpers/services/gelato/addProviderModuleDSA");
const createDSA = require("../../../../../helpers/services/InstaDapp/createDSA");
const initializeMakerCdp = require("../../../../../helpers/services/maker/initializeMakerCdp");
const getMockSpellsETHAToAave = require("./services/getSpellsETHAToAave.mock");
const getABI = require("../../../../../helpers/services/getABI");

const { expect } = require("chai");

module.exports = async function (mockRoute) {
  const wallets = await getWallets();
  const contracts = await getContracts();
  const ABI = getABI();

  // Gelato Testing environment setup.
  const gelatoExecutorAddress = contracts.mockDebtBridgeExecutorAave.address;

  await contracts.mockDebtBridgeExecutorAave
    .connect(wallets.executor)
    .stakeExecutor({
      value: await contracts.gelatoCore.minExecutorStake(),
    });

  expect(await contracts.gelatoCore.isExecutorMinStaked(gelatoExecutorAddress))
    .to.be.true;
  await provideFunds(
    wallets.gelatoProvider,
    contracts.gelatoCore,
    constants.GAS_LIMIT,
    constants.GAS_PRICE_CEIL
  );
  await providerAssignsExecutor(
    wallets.gelatoProvider,
    contracts.mockDebtBridgeExecutorAave.address,
    contracts.gelatoCore
  );
  await addProviderModuleDSA(
    wallets.gelatoProvider,
    contracts.gelatoCore,
    contracts.providerModuleDSA.address
  );
  contracts.dsa = await createDSA(
    wallets.userAddress,
    contracts.instaIndex,
    contracts.instaList
  );
  const vaultAId = await initializeMakerCdp(
    wallets.userAddress,
    contracts.DAI,
    contracts.dsa,
    contracts.getCdps,
    contracts.dssCdpManager,
    constants.MAKER_INITIAL_ETH,
    constants.MAKER_INITIAL_DEBT,
    ABI.ConnectMakerABI
  );
  const spells = await getMockSpellsETHAToAave(
    mockRoute,
    wallets,
    contracts,
    constants,
    vaultAId
  );

  return {
    wallets,
    contracts,
    constants,
    vaultAId,
    spells,
    ABI,
  };
};
