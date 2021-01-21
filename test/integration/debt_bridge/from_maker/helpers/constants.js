const hre = require("hardhat");
const { ethers } = hre;

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const GAS_LIMIT = "6000000";
const GAS_PRICE_CEIL = ethers.utils.parseUnits("1000", "gwei");

const MIN_COL_RATIO_MAKER = ethers.utils.parseUnits("3", 18);

// TO DO: make dynamic based on real time Collateral Price and Ratios
const MAKER_INITIAL_ETH = ethers.utils.parseEther("10");
const MAKER_INITIAL_DEBT = ethers.utils.parseUnits("1000", 18);

const MAX_FEES_IN_PERCENT = ethers.utils.parseUnits("1", 17);

// Chainlink Oracle Address

const DAI_ETH_PRICEFEEDER = "0x773616E4d11A78F511299002da57A0a94577F1f4";
const ETH_ETH_PRICEFEEDER = ethers.constants.AddressZero;

module.exports = {
  ETH: ETH,
  MIN_COL_RATIO_MAKER: MIN_COL_RATIO_MAKER,
  GAS_PRICE_CEIL: GAS_PRICE_CEIL,
  GAS_LIMIT: GAS_LIMIT,
  MAKER_INITIAL_DEBT: MAKER_INITIAL_DEBT,
  MAKER_INITIAL_ETH: MAKER_INITIAL_ETH,
  MAX_FEES_IN_PERCENT: MAX_FEES_IN_PERCENT,
  DAI_ETH_PRICEFEEDER: DAI_ETH_PRICEFEEDER,
  ETH_ETH_PRICEFEEDER: ETH_ETH_PRICEFEEDER,
};
