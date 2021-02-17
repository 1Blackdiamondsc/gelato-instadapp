const hre = require("hardhat");
const { ethers } = hre;

const ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const GAS_LIMIT = "6000000";
const GAS_PRICE_CEIL = ethers.utils.parseUnits("1000", "gwei");

const MIN_COL_RATIO_MAKER = ethers.utils.parseUnits("160", 16);

// TO DO: make dynamic based on real time Collateral Price and Ratios
const MAKER_INITIAL_ETH = ethers.utils.parseEther("15");
const MAKER_INITIAL_DEBT = ethers.utils.parseUnits("10000", 18);

const MAX_FEES_IN_PERCENT = ethers.utils.parseUnits("1", 17);

const BASE_MOCK_PRICE = ethers.utils.parseUnits("1800", 18);
const BASE_MOCK_PRICE_OFF = ethers.utils.parseUnits("500", 18);

// Chainlink Oracle Address

module.exports = {
  ETH: ETH,
  MIN_COL_RATIO_MAKER: MIN_COL_RATIO_MAKER,
  GAS_PRICE_CEIL: GAS_PRICE_CEIL,
  GAS_LIMIT: GAS_LIMIT,
  MAKER_INITIAL_DEBT: MAKER_INITIAL_DEBT,
  MAKER_INITIAL_ETH: MAKER_INITIAL_ETH,
  MAX_FEES_IN_PERCENT: MAX_FEES_IN_PERCENT,
  BASE_MOCK_PRICE: BASE_MOCK_PRICE,
  BASE_MOCK_PRICE_OFF: BASE_MOCK_PRICE_OFF,
};
