# gelato-instadapp

[![gelatodigital](https://circleci.com/gh/gelatodigital/gelato-instadapp.svg?style=shield)](https://circleci.com/gh/gelatodigital/gelato-instadapp)

<p  align="center">
<img  src="assets/instadapp_filled.svg"  width="150px"/>
<img  src="assets/Gelato_Black.svg"  width="150px"/></p>

This repo contains smart contracts, mocks and a test suite showcasing how InstaDapp DSAs and Gelato can work together to automate the execution (or casting) of Spells (connectors) based on arbitrary Conditions.

## Use Cases

### 1. Move DAI lending from DSR to Compound

For the first iteration, we started with a simple spell:
**Move DAI lending from DSR to Compound.**
This reused two existing deployed InstaDapp Connectors: `ConnectMaker.withdrawDai` and `ConnectCompound.deposit`.

Furtheremore the following contracts were added to showcase the automation of the Spell:

- `MockCDAI.sol` and `MockDSR.sol`: to normalize CDAI.supplyRatePerBlock and dsr values to a _per second rate in 10\*\*27 precision_

- `ConditionCompareUintsFromTwoSource`: a generic Gelato Condition that allows you to read and compare data from 2 arbitrary on-chain sources (returndata expected to be uint256 and normalized => hence MockDSR and MockCDAI). This Condition was used to compare DSR to CDAI rates and in the test suite we showcase how a change in the CDAI rate (it going above the DSR) can trigger an automatic rebalancing from DSR to CDAI via DSA Connectors.

- `ProviderModuleDsa`: this is needed for any Gelato integration. It tells Gelato how the execution payload should be formatted. In this prototype, it formats the payload for the `DSA.cast` function.

- `ConnectGelato`: this is a Connector needed for the DSA to be able to submit Tasks to Gelato. In the test suite we unlock the DSA MultiSig Master account at 0xfCD22438AD6eD564a1C26151Df73F6B33B817B56, in order to be able to enable this Connector in our mainnet fork running on the local hardhat network instance.

In this example, the DSA simply pre-deposits some ETH on Gelato to repay the executor for the transaction fees incurred from executing the task.

To see for yourself check out the [contracts](./contracts) folder and make sure to check out `test/mv-DAI-DSR-Compound.test.js`, to see an end-to-end test showcasing the prototype.

### 2. Debt Bridge - Refinance debt position from Maker to Compound based on changes in the ETH / USD price

Debt Bridge is a financial process that aims to make the user position safer. InstaDapp DSA and Gelato together can automate this process.

### Full Refinancing from Maker's Vault to Compound.

Based on the [debt bridge](https://docs.instadapp.io/usecases/debt-bridge/) documentation of Instadapp, we automated this process by adding two connectors `ConnectGelatoDataFullRefinanceMaker`, `ConnectGelatoExecutorPayment` and a Gelato condition contract.

- `ConditionMakerVaultIsSafe.sol`: determine if a specific vault is on an unsafe position.

- `ConnectGelatoDataFullRefinanceMaker.sol`: generates the required data which will be assigned to the different inputs needed by `ConnectMaker` and `ConnectCompound`. Examples are the amount of DAI to pay back or the amount of Ether to withdraw from Maker. He will create the chain of connectors call needed to perform the debt refinance, he will generate the data wanted by the flashloan connector and he will call this flashloan connector through the cast function of Dsa.

- `ConnectGelatoExecutorPayment.sol`: makes sure part of the moved collateral is used to pay the Gelato provider for the incurred transaction fee. The Gelato Provider will in turn pay the executor who executed the task.

In this example, the executor will be refunded for the incurred transaction fees by subtracting the estimated gas costs from the collateral which is moved from Maker to Compound. This means the user does not have to pre pay in order to incentivize the execution of the task.

For understanding the entire process of a full refinancing, from the opening of the vault on maker to the execution of the refinancing on InstaDapp, take a look at `test/2_Full-Debt-Bridge-Maker-Compound.test.js` test.

## Run the tests

1. Clone this repo
2. Put your Alchemy ID in .env
3. yarn install
4. npx hardhat test
