const getWallets = require("../../../../../helpers/services/getWallets");
const getContracts = require("../../../../../helpers/services/getContracts");
const getDebtBridgeFromMakerConstants = require("../../services/getDebtBridgeFromMakerConstants");
const stakeExecutor = require("../../../../../helpers/services/gelato/stakeExecutor");
const provideFunds = require("../../../../../helpers/services/gelato/provideFunds");
const providerAssignsExecutor = require("../../../../../helpers/services/gelato/providerAssignsExecutor");
const addProviderModuleDSA = require("../../../../../helpers/services/gelato/addProviderModuleDSA");
const createDSA = require("../../../../../helpers/services/InstaDapp/createDSA");
const initializeMakerCdp = require("../../../../../helpers/services/maker/initializeMakerCdp");
const getSpellsEthAEthBWithVaultCreation = require("./services/getSpells-ETHA-ETHB-With-Vault-Creation");
const getABI = require("../../../../../helpers/services/getABI");

module.exports = async function () {
  const wallets = await getWallets();
  const contracts = await getContracts();
  const constants = await getDebtBridgeFromMakerConstants();
  const ABI = getABI();

  // Gelato Testing environment setup.
  await stakeExecutor(wallets.gelatoExecutorWallet, contracts.gelatoCore);
  await provideFunds(
    wallets.gelatoProviderWallet,
    contracts.gelatoCore,
    constants.GAS_LIMIT,
    constants.GAS_PRICE_CEIL
  );
  await providerAssignsExecutor(
    wallets.gelatoProviderWallet,
    wallets.gelatoExecutorAddress,
    contracts.gelatoCore
  );
  await addProviderModuleDSA(
    wallets.gelatoProviderWallet,
    contracts.gelatoCore,
    contracts.dsaProviderModule.address
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

  const spells = await getSpellsEthAEthBWithVaultCreation(
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
