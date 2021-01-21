const getWallets = require("../../../../../helpers/services/getWallets");
const getContracts = require("../../../../../helpers/services/getContracts");
const constants = require("../../../../../integration/debt_bridge/from_maker/helpers/constants");
const provideFunds = require("../../../../../helpers/services/gelato/provideFunds");
const providerAssignsExecutor = require("../../../../../helpers/services/gelato/providerAssignsExecutor");
const addProviderModuleDSA = require("../../../../../helpers/services/gelato/addProviderModuleDSA");
const createDSA = require("../../../../../helpers/services/InstaDapp/createDSA");
const initializeMakerCdp = require("../../../../../helpers/services/maker/initializeMakerCdp");
const createVaultForETHB = require("../../../../../helpers/services/maker/createVaultForETHB");
const getMockSpellsETHAToETHB = require("./services/getSpellsETHAToETHB.mock");
const getABI = require("../../../../../helpers/services/getABI");

module.exports = async function (mockRoute) {
  const wallets = await getWallets();
  const contracts = await getContracts();
  const ABI = getABI();

  // Gelato Testing environment setup.
  await provideFunds(
    wallets.gelatoProvider,
    contracts.gelatoCore,
    constants.GAS_LIMIT,
    constants.GAS_PRICE_CEIL
  );
  await providerAssignsExecutor(
    wallets.gelatoProvider,
    contracts.mockDebtBridgeExecutorETHB.address,
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
  const vaultBId = await createVaultForETHB(
    wallets.userAddress,
    contracts.DAI,
    contracts.dsa,
    contracts.getCdps,
    contracts.dssCdpManager
  );
  const spells = await getMockSpellsETHAToETHB(
    wallets,
    contracts,
    constants,
    mockRoute,
    vaultAId,
    vaultBId
  );

  return {
    wallets,
    contracts,
    constants,
    vaultAId,
    vaultBId,
    spells,
    ABI,
  };
};
