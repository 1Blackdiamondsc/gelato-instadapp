const getWallets = require("../../../../helpers/services/getWallets");
const constants = require("./constants");
const getContracts = require("../../../../helpers/services/getContracts");
const stakeExecutor = require("../../../../helpers/services/gelato/stakeExecutor");
const provideFunds = require("../../../../helpers/services/gelato/provideFunds");
const providerAssignsExecutor = require("../../../../helpers/services/gelato/providerAssignsExecutor");
const addProviderModuleDSA = require("../../../../helpers/services/gelato/addProviderModuleDSA");
const createDSA = require("../../../../helpers/services/InstaDapp/createDSA");
const initializeMakerCdp = require("../../../../helpers/services/maker/initializeMakerCdp");
const getSpellsETHAToCompound = require("./services/getSpellsETHAToCompound");
const getABI = require("../../../../helpers/services/getABI");

module.exports = async function () {
  const wallets = await getWallets();
  const contracts = await getContracts();
  const ABI = getABI();

  // Gelato Testing environment setup.
  await stakeExecutor(wallets.executor, contracts.gelatoCore);
  await provideFunds(
    wallets.gelatoProvider,
    contracts.gelatoCore,
    constants.GAS_LIMIT,
    constants.GAS_PRICE_CEIL
  );
  await providerAssignsExecutor(
    wallets.gelatoProvider,
    wallets.gelatoExecutorAddress,
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
  const vaultId = await initializeMakerCdp(
    wallets.userAddress,
    contracts.DAI,
    contracts.dsa,
    contracts.getCdps,
    contracts.dssCdpManager,
    constants.MAKER_INITIAL_ETH,
    constants.MAKER_INITIAL_DEBT,
    ABI.ConnectMakerABI
  );

  const spells = await getSpellsETHAToCompound(
    wallets,
    contracts,
    constants,
    vaultId
  );

  return {
    wallets,
    contracts,
    constants,
    vaultId,
    spells,
    ABI,
  };
};
