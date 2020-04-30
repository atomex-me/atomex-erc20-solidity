var Atomex = artifacts.require("../contracts/Atomex.sol");
var FiatTokenV1 = artifacts.require('../contracts/FiatTokenV1.sol');

module.exports = function(deployer) {
  deployer.deploy(Atomex);
  deployer.deploy(FiatTokenV1);
};
