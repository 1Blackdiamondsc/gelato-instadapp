const { PREMIUM } = require("./costs");

module.exports = (route) => {
  let rawGasCost;
  switch (route) {
    case 0:
      rawGasCost = 2358534; // gasLeft method
      break;
    case 1:
      rawGasCost = 2956937; // gasLeft method
      break;
    case 2:
      rawGasCost = 3381960; // gasLeft method
      break;
    case 3:
      rawGasCost = 4029400; // gasLeft method
      break;
    default:
      break;
  }

  return Math.floor((rawGasCost * (100 + PREMIUM)) / 100);
};
