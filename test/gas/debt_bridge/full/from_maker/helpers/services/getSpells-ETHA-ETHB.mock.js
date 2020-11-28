const { expect } = require("chai");
const hre = require("hardhat");
const { deployments, ethers } = hre;
const GelatoCoreLib = require("@gelatonetwork/core");

// Instadapp UI should do the same implementation for submitting debt bridge task
module.exports = async function (
  wallets,
  contracts,
  constants,
  mockRoute,
  vaultAId,
  vaultBId
) {
  //#region Step 9 Provider should whitelist task

  // By WhiteList task, the provider can constrain the type
  // of task the user can submitting.

  //#region Actions

  const spells = [];

  const debtBridgeCalculationForFullRefinance = new GelatoCoreLib.Action({
    addr: contracts.mockConnectGelatoDataFullMakerToMaker.address,
    data: await hre.run("abi-encode-withselector", {
      abi: (
        await deployments.getArtifact("MockConnectGelatoDataFullMakerToMaker")
      ).abi,
      functionname: "getDataAndCastMakerToMaker",
      inputs: [mockRoute, vaultAId, vaultBId, constants.ETH, "ETH-B"],
    }),
    operation: GelatoCoreLib.Operation.Delegatecall,
    termsOkCheck: true,
  });

  spells.push(debtBridgeCalculationForFullRefinance);

  const gasPriceCeil = ethers.constants.MaxUint256;

  const mockConnectGelatoDataFullMakerToMakerTaskSpec = new GelatoCoreLib.TaskSpec(
    {
      conditions: [
        contracts.conditionMakerVaultUnsafe.address,
        contracts.conditionDebtBridgeIsAffordable.address,
        contracts.conditionDestVaultWillBeSafe.address,
      ],
      actions: spells,
      gasPriceCeil,
    }
  );

  await expect(
    contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .provideTaskSpecs([mockConnectGelatoDataFullMakerToMakerTaskSpec])
  ).to.emit(contracts.gelatoCore, "LogTaskSpecProvided");

  expect(
    await contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .isTaskSpecProvided(
        wallets.gelatoProviderAddress,
        mockConnectGelatoDataFullMakerToMakerTaskSpec
      )
  ).to.be.equal("OK");

  expect(
    await contracts.gelatoCore
      .connect(wallets.gelatoProvider)
      .taskSpecGasPriceCeil(
        wallets.gelatoProviderAddress,
        await contracts.gelatoCore
          .connect(wallets.gelatoProvider)
          .hashTaskSpec(mockConnectGelatoDataFullMakerToMakerTaskSpec)
      )
  ).to.be.equal(gasPriceCeil);

  //#endregion

  return spells;
};
