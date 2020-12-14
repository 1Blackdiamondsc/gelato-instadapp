const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

// Instadapp UI should do the same implementation for submitting debt bridge task
module.exports = async function (
  mockRoute,
  wallets,
  contracts,
  constants,
  vaultId
) {
  //#region Step 9 Provider should whitelist task

  // By WhiteList task, the provider can constrain the type
  // of task the user can submitting.

  //#region Actions

  const spells = [];

  const debtBridgeCalculationForFullRefinance = new GelatoCoreLib.Action({
    addr: contracts.mockConnectGelatoDataFullMakerToCompound.address,
    data: await hre.run("abi-encode-withselector", {
      abi: (
        await deployments.getArtifact(
          "MockConnectGelatoDataFullMakerToCompound"
        )
      ).abi,
      functionname: "getDataAndCastMakerToCompound",
      inputs: [mockRoute, vaultId, constants.ETH],
    }),
    operation: GelatoCoreLib.Operation.Delegatecall,
    termsOkCheck: true,
  });

  spells.push(debtBridgeCalculationForFullRefinance);

  const gasPriceCeil = ethers.constants.MaxUint256;

  const mockConnectGelatoDataFullMakerToCompoundTaskSpec = new GelatoCoreLib.TaskSpec(
    {
      conditions: [
        contracts.conditionMakerVaultUnsafe.address,
        contracts.conditionDebtBridgeIsAffordable.address,
      ],
      actions: spells,
      gasPriceCeil,
    }
  );

  await expect(
    contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .provideTaskSpecs([mockConnectGelatoDataFullMakerToCompoundTaskSpec])
  ).to.emit(contracts.gelatoCore, "LogTaskSpecProvided");

  expect(
    await contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .isTaskSpecProvided(
        wallets.gelatoProviderAddress,
        mockConnectGelatoDataFullMakerToCompoundTaskSpec
      )
  ).to.be.equal("OK");

  expect(
    await contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .taskSpecGasPriceCeil(
        wallets.gelatoProviderAddress,
        await contracts.gelatoCore
          .connect(wallets.gelatoProvider)
          .hashTaskSpec(mockConnectGelatoDataFullMakerToCompoundTaskSpec)
      )
  ).to.be.equal(gasPriceCeil);

  //#endregion

  return spells;
};
