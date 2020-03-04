const AtomicSwap = artifacts.require('../contracts/AtomicSwap.sol');
const FiatTokenV1 = artifacts.require('../contracts/FiatTokenV1.sol');

const sleep = async function (time) {
    await web3.currentProvider.send({
        id: new Date().getTime(),
        jsonrpc: "2.0",
        method: "evm_increaseTime",
        params: [time]
    }, function(error, result) {
        if(error) console.error('evm_increaseTime: ' + error);
    });
    await web3.currentProvider.send({
        id: new Date().getTime(),
        jsonrpc: "2.0",
        method: "evm_mine",
        params: []
    }, function(error, result){
        if(error) console.error('evm_mine: ' + error);
    });
}

function getCurrentTime() {
    return new Promise(function(resolve) {
      web3.eth.getBlock("latest").then(function(block) {
            resolve(block.timestamp)
        });
    })
}

contract('AtomicSwap', async (accounts) => {
    let contractSwap;
    let contractUSDC;
    let owner = accounts[0];
    let supply = 100000;

    beforeEach(async function(){
        contractSwap = await AtomicSwap.new();
        contractUSDC = await FiatTokenV1.new();

        let name = 'usdc';
        let symbol = 'usdc';
        let currency = 'usdc';
        let decimals = 6;
    
        await contractUSDC.initialize(name, symbol, currency, decimals, owner, owner);

        await contractUSDC.configureMinter(owner, supply);

        await contractUSDC.mint(owner, supply);
    });

    it('should approve properly', async () => {
        let value = 100;

        await contractUSDC.approve(contractSwap.address, value);

        let balance = await contractUSDC.balanceOf(owner);
        assert.equal(balance, supply);
        
        let allowance = await contractUSDC.allowance(owner, contractSwap.address);
        assert.equal(allowance, value);
    });

    it('should initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value = 100;
        let payoff = 1;
        let active = true;

        let swap = await contractSwap.swaps(hashed_secret);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.countdown, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.active, false);
        assert.equal(swap.state, 0);

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        swap = await contractSwap.swaps(hashed_secret);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, contractUSDC.address);
        assert.equal(swap.participant, participant);
        assert.equal(swap.initiator, sender);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.countdown), BigInt(countdown));
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.active, active);
        assert.equal(swap.state, 1);

        assert.equal(contractBalance, value);
    });

    it('should multiply initiate properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});

        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        swap = await contractSwap.swaps(hashed_secret);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);

        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, contractUSDC.address);
        assert.equal(swap.participant, participant);
        assert.equal(swap.initiator, sender);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.countdown), BigInt(countdown));
        assert.deepEqual(BigInt(swap.value), BigInt(value1 + value2 - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.active, active);
        assert.equal(swap.state, 1);

        assert.deepEqual(BigInt(contractBalance), BigInt(value1 + value2));
    });

    it('should not initiate if hashed_secret is already used', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is already initiated') >= 0);
        }
    });
 
    it('should not intitiate with wrong refund timestamp', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = -1;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid refundTimestamp') >= 0);
        }

        refundTimestamp = 115792089237316195423570985008687907853269984665640564039457584007913129639936;
        
        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid number value') >= 0);
        }
    });

    it('should not intitiate with wrong payoff', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value = 100;
        let payoff = 101;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath: subtraction overflow') >= 0);
        }

        payoff = -1;

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath: subtraction overflow') >= 0);
        }
    });

    it('should not intitiate with wrong countdown', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 2000000000;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid countdown') >= 0);
        }

        countdown = -1;

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid countdown') >= 0);
        }
    });

    it('should not add if swap is not initiated', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let sender = accounts[0];
        let value = 100;

        await contractUSDC.approve(contractSwap.address, value);

        try {
            await contractSwap.add(hashed_secret, value, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not add after refundTime', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 30;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime * 2));

        try {
            await contractSwap.add(hashed_secret, value, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already come') >= 0);
        }
    });

    it('should redeem properly', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let redeemerBalance = await contractUSDC.balanceOf(redeemer);

        swap = await contractSwap.swaps(hashed_secret);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.countdown, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.active, false);
        assert.equal(swap.state, 0);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value));
        assert.equal(redeemerBalance, 0);
    });

    it('should redeem properly during the countdown', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime - countdown + 1));

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let redeemerBalance = await contractUSDC.balanceOf(redeemer);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value - payoff));
        assert.deepEqual(BigInt(redeemerBalance), BigInt(payoff));
    });

    it('should redeem properly after multiple init', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await sleep(~~(refundTime - countdown + 1));

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let redeemerBalance = await contractUSDC.balanceOf(redeemer);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value1 + value2 - payoff));
        assert.deepEqual(BigInt(redeemerBalance), BigInt(payoff));
    });

    it('should redeem properly with payoff = 0', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 0;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await sleep(~~(refundTime - countdown + 1));

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let redeemerBalance = await contractUSDC.balanceOf(redeemer);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value1 + value2));
        assert.equal(redeemerBalance, 0);
    });

    it('should not redeem if not active', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = false;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('ap is not active') >= 0);
        }
    });

    it('should redeem properly after activation', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = false;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await contractSwap.activate(hashed_secret, {from: sender, value: 0});

        await sleep(~~(refundTime - countdown + 1));

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let redeemerBalance = await contractUSDC.balanceOf(redeemer);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value1 + value2 - payoff));
        assert.deepEqual(BigInt(redeemerBalance), BigInt(payoff));
    });

    it('should not redeem twice', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem after refundTime', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already passed') >= 0);
        }
    });

    it('should not redeem with wrong secret', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d84f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should not redeem with wrong sized secret', async () => {
        let secret = '0x111111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x9e7156f17d23cd6df8abb2b239f739bfd206836d79a83937b4f852bcf206544f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('invalid bytes32 value') >= 0);
        }

        secret = '0x11111111111111111111111111111111111111111111111111111111111111';
        hashed_secret = '0xb71e60c29fedef4ba4dd4c7ec1357e34742f614dd64c14f070c009b36983c118';

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });

    it('should refund properly', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        let senderBalance = await contractUSDC.balanceOf(sender);

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));
        
        await contractSwap.refund(hashed_secret, {from: refunder, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        swap = await contractSwap.swaps(hashed_secret);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.secret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.countdown, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.active, false);
        assert.equal(swap.state, 0);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance));
    });

    it('should refund properly after multiple init', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[1];
        let countdown = 30;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = true;

        let senderBalance = await contractUSDC.balanceOf(sender);

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await sleep(~~(refundTime+1));

        await contractSwap.refund(hashed_secret, {from: refunder, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance));
    });

    it('should refund properly with payoff = 0', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[1];
        let countdown = 30;
        let value1 = 100;
        let value2 = 200;
        let payoff = 0;
        let active = true;

        let senderBalance = await contractUSDC.balanceOf(sender);

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await sleep(~~(refundTime+1));

        await contractSwap.refund(hashed_secret, {from: refunder, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance));
    });

    it('should refund properly if not active', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = false;

        let senderBalance = await contractUSDC.balanceOf(sender);

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime+1));

        await contractSwap.refund(hashed_secret, {from: refunder, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance));
    });

    it('should not refund twice', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));
        
        await contractSwap.refund(hashed_secret, {from: refunder, value: 0});

        hashed_secret = '0x2222222222222222222222222222222222222222222222222222222222222222';
        
        try {
            await contractSwap.refund(hashed_secret, {from: refunder, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not refund before refundTime', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        try {
            await contractSwap.refund(hashed_secret, {from: refunder, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has not passed') >= 0);
        }
    });

    it('should not refund if redeemed', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});
        
        await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});

        await sleep(~~(refundTime+1));

        try {
            await contractSwap.refund(hashed_secret, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should not redeem if refunded', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});
        
        await sleep(~~(refundTime+1));

        await contractSwap.refund(hashed_secret, {from: sender, value: 0});
        
        try {
            await contractSwap.redeem(hashed_secret, secret, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this hash is empty or already spent') >= 0);
        }
    });

    it('should emit Initiated event', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        let res = await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        assert.equal(res.logs[0].event, "Initiated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._contract, contractUSDC.address);
        assert.equal(res.logs[0].args._participant, participant);
        assert.equal(res.logs[0].args._initiator, sender);
        assert.deepEqual(BigInt(res.logs[0].args._refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(res.logs[0].args._countdown), BigInt(countdown));
        assert.deepEqual(BigInt(res.logs[0].args._value), BigInt(value - payoff));
        assert.deepEqual(BigInt(res.logs[0].args._payoff), BigInt(payoff));
        assert.equal(res.logs[0].args._active, active);
    });

    it('should emit Added event', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});

        let res = await contractSwap.add(hashed_secret, value2, {from: sender, value: 0});

        assert.equal(res.logs[0].event, "Added");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._sender, sender);
        assert.deepEqual(BigInt(res.logs[0].args._value), BigInt(value1 + value2 - payoff));
    });

    it('should emit Activated event', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let countdown = 10;
        let value1 = 100;
        let value2 = 200;
        let payoff = 1;
        let active = false;

        await contractUSDC.approve(contractSwap.address, value1 + value2);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value1, payoff, active, {from: sender, value: 0});

        let res = await contractSwap.activate(hashed_secret, {from: sender, value: 0});

        assert.equal(res.logs[0].event, "Activated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
    });

    it('should emit Redeemed event', async () => {
        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let redeemer = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        let res = await contractSwap.redeem(hashed_secret, secret, {from: redeemer, value: 0});
        
        assert.equal(res.logs[0].event, "Redeemed");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._secret, secret);
    });

    it('should emit Refunded event', async () => {
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let sender = accounts[0];
        let participant = accounts[1];
        let refunder = accounts[2];
        let countdown = 10;
        let value = 100;
        let payoff = 1;
        let active = true;

        await contractUSDC.approve(contractSwap.address, value);

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, refundTimestamp, countdown, value, payoff, active, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));
        
        let res = await contractSwap.refund(hashed_secret, {from: refunder, value: 0});
        
        assert.equal(res.logs[0].event, "Refunded");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
    });
});