const Atomex = artifacts.require('./contracts/Atomex.sol');
const FiatTokenV1 = artifacts.require('./contracts/FiatTokenV1.sol');

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

contract('Atomex', async (accounts) => {
    let contractSwap;
    let contractUSDC;
    let owner = accounts[0];
    let supply = 100000;

    beforeEach(async function(){
        contractSwap = await Atomex.new();
        contractUSDC = await FiatTokenV1.new();

        let name = 'usdc';
        let symbol = 'usdc';
        let currency = 'usdc';
        let decimals = 6;
    
        await contractUSDC.initialize(name, symbol, currency, decimals, owner, owner);

        await contractUSDC.configureMinter(owner, supply);

        await contractUSDC.mint(owner, supply);

        await contractUSDC.transfer(accounts[1], supply/2);
    });

    it('should approve properly', async () => {
        let value = 100;

        await contractUSDC.approve(contractSwap.address, value);

        let balance = await contractUSDC.balanceOf(owner);
        assert.equal(balance, supply/2);
        
        let allowance = await contractUSDC.allowance(owner, contractSwap.address);
        assert.equal(allowance, value);
    });

    it('should manage watchers properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
        
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, true);

        await contractSwap.deactivateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
    });

    it('should not deactivate watchers if not owner', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let sender = accounts[1];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        try {
            await contractSwap.deactivateWatcher(watcher, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('sender is not the owner') >= 0);
        }
    });

    it('should withdraw watchers properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        let Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, false);
        
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
        Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(deposit));
        assert.equal(Watcher.active, true);

        let watcherBalance = await web3.eth.getBalance(watcher);
        let txReceipt = await contractSwap.withdrawWatcher({from: watcher, value: 0});
        let newWatcherBalance = await web3.eth.getBalance(watcher);
        let tx = await web3.eth.getTransaction(txReceipt.tx);
        assert.deepEqual(BigInt(newWatcherBalance), BigInt(watcherBalance) + BigInt(deposit) - BigInt(txReceipt.receipt.gasUsed * tx.gasPrice));

        let contractSwapBalance = await web3.eth.getBalance(contractSwap.address);
        assert.deepEqual(BigInt(contractSwapBalance), BigInt(0));

        Watcher = await contractSwap.watchTowers(watcher);
        assert.deepEqual(BigInt(Watcher.deposit), BigInt(0));
        assert.equal(Watcher.active, false);
    });

    it('should initiate properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashedID = '0x74f758334ea8b733076264dc377bb1536607b0e169e0185c76114e249fa720c4'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        let swap = await contractSwap.swaps(hashedID);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.watcherDeadline, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        let watcherDeadline = (await getCurrentTime()) + refundTime * 2 / 3;

        swap = await contractSwap.swaps(hashedID);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        assert.equal(swap.hashedSecret, hashed_secret);
        assert.equal(swap.contractAddr, contractUSDC.address);
        assert.equal(swap.participant, participant);
        assert.equal(swap.initiator, sender);
        assert.equal(swap.watcher, watcher);
        assert.deepEqual(BigInt(swap.refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(swap.watcherDeadline), BigInt(watcherDeadline));
        assert.deepEqual(BigInt(swap.value), BigInt(value - payoff));
        assert.equal(swap.payoff, payoff);
        assert.equal(swap.state, 1);

        assert.equal(contractBalance, value);
    });
 
    it('should not initiate if hashed_secret is already used', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this ID is already initiated') >= 0);
        }
    });
        
    it('should not intitiate with wrong watcher', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[1];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});


        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
                watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('watcher does not exist') >= 0);
        }
    });
 
    it('should not intitiate with wrong refund timestamp', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[1];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = -1;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already come') >= 0);
        }

        refundTimestamp = 115792089237316195423570985008687907853269984665640564039457584007913129639936;
        
        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('overflow') >= 0);
        }
    });

    it('should not intitiate with wrong payoff', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[1];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});
 
        let hashed_secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 101;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('SafeMath sub wrong value') >= 0);
        }

        payoff = -1;

        try {
            await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('value out-of-bounds') >= 0);
        }
    });

    it('should redeem properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        
        swap = await contractSwap.swaps(hashedID);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.watcherDeadline, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value - payoff));
        assert.equal(watcherBalance, payoff);
    });

    it('should redeem properly with payoff = 0', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value));
        assert.equal(watcherBalance, 0);
    });
    
    it('should redeem properly by participant address', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: participant, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value));
    });

    it('should redeem properly by any address', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: accounts[4], value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value));
    });

    it('should redeem properly by watcher after Deadline', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime * 2 / 3 + 1));

        await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value - payoff));
        assert.equal(watcherBalance, payoff);
    });
    
    it('should redeem properly by another watcher', async () => {
        let owner = await contractSwap.owner();
        let watcher1 = accounts[3];
        let watcher2 = accounts[4];
        let deposit = 10;

        await contractSwap.proposeWatcher(watcher1, {from: watcher1, value: deposit});
        await contractSwap.activateWatcher(watcher1, {from: owner, value: 0});

        await contractSwap.proposeWatcher(watcher2, {from: watcher2, value: deposit});
        await contractSwap.activateWatcher(watcher2, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher1, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime * 2 / 3 + 1));

        await contractSwap.redeem(hashedID, secret, {from: watcher2, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let watcherBalance = await contractUSDC.balanceOf(watcher2);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value - payoff));
        assert.equal(watcherBalance, payoff);
    });
    
    it('should redeem properly by initiator after refundTimestamp', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);

        await contractSwap.redeem(hashedID, secret, {from: sender, value: 0});

        let participantBalance = await contractUSDC.balanceOf(participant);
        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let newSenderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(participantBalance), BigInt(value - payoff));
        assert.equal(BigInt(newSenderBalance), BigInt(senderBalance) + BigInt(payoff));
    });
    
    it('should not redeem twice', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});

        try {
            await contractSwap.redeem(hashedID, secret, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this ID is empty or already spent') >= 0);
        }
    });

    it('should not redeem after refundTime', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        try {
            await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has already come') >= 0);
        }
    });

    it('should not redeem with wrong secret', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111122';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });
    
    it('should not redeem with wrong sized secret', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x111111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('incorrect data length') >= 0);
        }

        secret = '0x11111111111111111111111111111111111111111111111111111111111111';
        hashed_secret = '0xb71e60c29fedef4ba4dd4c7ec1357e34742f614dd64c14f070c009b36983c118';
        hashedID = '0xeede062128f773d06d55b601e61a3c6088da6d6364bcbe057163fcf156410449' 

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        try {
            await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('secret is not correct') >= 0);
        }
    });
    

    it('should refund properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);
        let watcherBalance = await contractUSDC.balanceOf(watcher);
        
        await contractSwap.refund(hashedID, {from: watcher, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_watcherBalance = await contractUSDC.balanceOf(watcher);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        swap = await contractSwap.swaps(hashedID);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.watcherDeadline, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value) - BigInt(payoff));
        assert.deepEqual(BigInt(new_watcherBalance), BigInt(watcherBalance) + BigInt(payoff));
    });

    it('should refund properly with payoff = 0', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);
        let watcherBalance = await contractUSDC.balanceOf(watcher);
        
        await contractSwap.refund(hashedID, {from: watcher, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_watcherBalance = await contractUSDC.balanceOf(watcher);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value));
        assert.deepEqual(BigInt(new_watcherBalance), BigInt(watcherBalance));
    });

    it('should refund properly after watcherDeadline', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime * 3 / 2 + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);
        let watcherBalance = await contractUSDC.balanceOf(watcher);
        
        await contractSwap.refund(hashedID, {from: watcher, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_watcherBalance = await contractUSDC.balanceOf(watcher);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value) - BigInt(payoff));
        assert.deepEqual(BigInt(new_watcherBalance), BigInt(watcherBalance) + BigInt(payoff));
    });

    it('should refund properly by sender', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);
        
        await contractSwap.refund(hashedID, {from: sender, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value));
    });

    it('should refund properly by any address', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));

        let senderBalance = await contractUSDC.balanceOf(sender);
        
        await contractSwap.refund(hashedID, {from: accounts[4], value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_senderBalance = await contractUSDC.balanceOf(sender);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_senderBalance), BigInt(senderBalance) + BigInt(value));
    });

    it('should not refund twice', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));
        
        await contractSwap.refund(hashedID, {from: watcher, value: 0});
        
        try {
            await contractSwap.refund(hashedID, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this ID is empty or already spent') >= 0);
        }
    });
    
    it('should not refund before refundTime', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        try {
            await contractSwap.refund(hashedID, {from: watcher, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('refundTimestamp has not come') >= 0);
        }
    });

    it('should not refund if redeemed', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});

        await sleep(~~(refundTime+1));

        try {
            await contractSwap.refund(hashedID, {from: sender, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this ID is empty or already spent') >= 0);
        }
    });

    it('should not redeem if refunded', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});
        
        await sleep(~~(refundTime+1));

        await contractSwap.refund(hashedID, {from: sender, value: 0});
        
        try {
            await contractSwap.redeem(hashedID, secret, {from: participant, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('swap for this ID is empty or already spent') >= 0);
        }
    });

    it('should release properly', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        let releaseTimeout = refundTimestamp + 60*60*24*7

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(releaseTimeout + 1));

        let ownerBalance = await contractUSDC.balanceOf(owner);
        
        await contractSwap.release(hashedID, {from: owner, value: 0});

        let contractBalance = await contractUSDC.balanceOf(contractSwap.address);
        let new_ownerBalance = await contractUSDC.balanceOf(owner);

        swap = await contractSwap.swaps(hashedID);
        assert.equal(swap.hashedSecret, '0x0000000000000000000000000000000000000000000000000000000000000000');
        assert.equal(swap.contractAddr, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.participant, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.initiator, '0x0000000000000000000000000000000000000000');
        assert.equal(swap.refundTimestamp, 0);
        assert.equal(swap.watcherDeadline, 0);
        assert.equal(swap.value, 0);
        assert.equal(swap.payoff, 0);
        assert.equal(swap.state, 0);

        assert.equal(contractBalance, 0);
        assert.deepEqual(BigInt(new_ownerBalance), BigInt(ownerBalance) + BigInt(value));
    });    

    it('should not release before releaseTimeout', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        let releaseTimeout = refundTimestamp + 60*60*24*7

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(releaseTimeout - 1));

        try {
            await contractSwap.release(hashedID, {from: owner, value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('releaseTimeout has not passed') >= 0);
        }      
    });    

    it('should not release by any address except the owner', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = false;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 1;

        let releaseTimeout = refundTimestamp + 60*60*24*7

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(releaseTimeout + 1));

        try {
            await contractSwap.release(hashedID, {from: accounts[4], value: 0});
        }
        catch (error) {
            assert(error.message.indexOf('sender is not the owner') >= 0);
        }   
    });    

    it('should emit Initiated event', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        let res = await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        let watcherDeadline = (await getCurrentTime()) + refundTime * 2 / 3;

        assert.equal(res.logs[0].event, "Initiated");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._contract, contractUSDC.address);
        assert.equal(res.logs[0].args._participant, participant);
        assert.equal(res.logs[0].args._initiator, sender);
        assert.deepEqual(BigInt(res.logs[0].args._refundTimestamp), BigInt(refundTimestamp));
        assert.deepEqual(BigInt(res.logs[0].args._watcherDeadline), BigInt(watcherDeadline));
        assert.deepEqual(BigInt(res.logs[0].args._value), BigInt(value - payoff));
        assert.deepEqual(BigInt(res.logs[0].args._payoff), BigInt(payoff));
    });

    it('should emit Redeemed event', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        let res = await contractSwap.redeem(hashedID, secret, {from: watcher, value: 0});
        
        assert.equal(res.logs[0].event, "Redeemed");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
        assert.equal(res.logs[0].args._secret, secret);
    });

    it('should emit Refunded event', async () => {
        let owner = await contractSwap.owner();
        let watcher = accounts[3];
        let deposit = 10;
        
        await contractSwap.proposeWatcher(watcher, {from: watcher, value: deposit});
        await contractSwap.activateWatcher(watcher, {from: owner, value: 0});

        let secret = '0x1111111111111111111111111111111111111111111111111111111111111111';
        let hashed_secret = '0x59420d36b80353ed5a5822ca464cc9bffb8abe9cd63959651d3cd85a8252d83f';
        let hashedID = '0x3a4db25d7f1534f741d6de027249e89db6c6d65df0e62f8311e4a21dd1f3c123'
        let refundTime = 60;
        let refundTimestamp = (await getCurrentTime()) + refundTime;
        let watcherForRedeem = true;
        let sender = accounts[1];
        let participant = accounts[2];
        let value = 100;
        let payoff = 0;

        await contractUSDC.approve(contractSwap.address, value, {from: sender});

        await contractSwap.initiate(hashed_secret, contractUSDC.address, participant, watcher, refundTimestamp, 
            watcherForRedeem, value, payoff, {from: sender, value: 0});

        await sleep(~~(refundTime + 1));
        
        let res = await contractSwap.refund(hashedID, {from: watcher, value: 0});
        
        assert.equal(res.logs[0].event, "Refunded");
        assert.equal(res.logs[0].args._hashedSecret, hashed_secret);
    });
});