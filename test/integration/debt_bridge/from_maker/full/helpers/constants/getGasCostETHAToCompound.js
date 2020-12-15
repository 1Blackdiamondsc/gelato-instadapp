const { PREMIUM } = require("./costs");

module.exports = (route) => {
  let rawGasCost;
  switch (route) {
    case 0:
      rawGasCost = 2028307; // gasLeft method
      break;
    case 1:
      rawGasCost = 2626711; // gasLeft method
      break;
    case 2:
      rawGasCost = 2944065; // gasLeft method
      break;
    case 3:
      rawGasCost = 3698800; // gasLeft method
      break;
    default:
      break;
  }

  return Math.floor((rawGasCost * (100 + PREMIUM)) / 100);
};
