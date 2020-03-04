var AtomicSwap = artifacts.require("../contracts/AtomicSwap.sol");
var FiatTokenV1 = artifacts.require('../contracts/FiatTokenV1.sol');

module.exports = function(deployer) {
  deployer.deploy(AtomicSwap);
  deployer.deploy(FiatTokenV1);
};



