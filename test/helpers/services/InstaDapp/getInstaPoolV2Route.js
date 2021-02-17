module.exports = async function (token, tokenDebtToMove, instaPoolResolver) {
  const rData = await instaPoolResolver.getTokenLimit(token);

  if (rData.dydx.gt(tokenDebtToMove)) return 0;
  if (rData.compound.gt(tokenDebtToMove)) return 1;
  if (rData.maker.gt(tokenDebtToMove)) return 2;
  if (rData.aave.gt(tokenDebtToMove)) return 3;
};
