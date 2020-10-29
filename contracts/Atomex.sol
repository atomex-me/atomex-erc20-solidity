pragma solidity ^0.5.0;

// From file: openzeppelin-contracts/contracts/math/SafeMath.sol
library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 c = a + b;
        require(c >= a, "SafeMath: addition overflow");
        return c;
    }
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath: subtraction overflow");
        uint256 c = a - b;
        return c;
    }
}

// From file: openzeppelin-contracts/contracts/utils/Address.sol
library Address {
    function isContract(address account) internal view returns (bool) {
        uint256 size;
        // solium-disable-next-line
        assembly { size := extcodesize(account) }
        return size > 0;
    }
}

// File: openzeppelin-contracts/contracts/token/ERC20/SafeERC20.sol
library SafeERC20 {
    using SafeMath for uint256;
    using Address for address;

    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transfer.selector, to, value));
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        callOptionalReturn(token, abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
    }

    function safeApprove(IERC20 token, address spender, uint256 value) internal {
        require(
            (value == 0) || (token.allowance(address(this), spender) == 0),
            "SafeERC20: approve from non-zero to non-zero allowance"
        );
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, value));
    }

    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 newAllowance = token.allowance(address(this), spender).add(value);
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    function safeDecreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 newAllowance = token.allowance(address(this), spender).sub(value);
        callOptionalReturn(token, abi.encodeWithSelector(token.approve.selector, spender, newAllowance));
    }

    function callOptionalReturn(IERC20 token, bytes memory data) private {
        require(address(token).isContract(), "SafeERC20: call to non-contract");

        (bool success, bytes memory returndata) = address(token).call(data);
        require(success, "SafeERC20: low-level call failed");

        if (returndata.length > 0) {
            require(abi.decode(returndata, (bool)), "SafeERC20: ERC20 operation did not succeed");
        }
    }
}

// File: openzeppelin-contracts/contracts/token/ERC20/IERC20.sol
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// File: openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol
contract ReentrancyGuard {
    bool private _notEntered;

    constructor () internal {
        _notEntered = true;
    }

    modifier nonReentrant() {
        require(_notEntered, "ReentrancyGuard: reentrant call");
        _notEntered = false;
        _;
        _notEntered = true;
    }
}

contract Ownable {
    address private _owner;
    address private _successor;
    
    event OwnershipTransferred(address previousOwner, address newOwner);
    event NewOwnerProposed(address previousOwner, address newOwner);
    
    constructor() public {
        setOwner(msg.sender);
    }
    
    function owner() public view returns (address) {
        return _owner;
    }
    
    function successor() public view returns (address) {
        return _successor;
    }
    
    function setOwner(address newOwner) internal {
        _owner = newOwner;
    }
    
    function setSuccessor(address newOwner) internal {
        _successor = newOwner;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner(), "sender is not the owner");
        _;
    }
    
    modifier onlySuccessor() {
        require(msg.sender == successor(), "sender is not the proposed owner");
        _;
    }
    
    function proposeOwner(address newOwner) public onlyOwner {
        require(newOwner != address(0), "invalid owner address");
        emit NewOwnerProposed(owner(), newOwner);
        setSuccessor(newOwner);
    }
    
    function acceptOwnership() public onlySuccessor {
        emit OwnershipTransferred(owner(), successor());
        setOwner(successor());
    }
}

contract WatchTower is Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    
    struct Watcher {
        uint256 deposit;
        bool registered;
        uint256 withdrawalTimeout;
        uint256 withdrawalTimestamp;
    }

    event NewWatcherProposed(address _contract, address _newWatcher, uint256 _deposit, uint256 _withdrawalTimeout);
    event NewWatcherRegistered(address _contract, address _newWatcher);
    event WatcherDeactivated(address _contract, address _watcher);
    event WatcherWithdrawn(address _contract, address _watcher);
    event WatcherRemoved(address _contract, address _watcher);
    
    mapping(address => mapping(address => Watcher)) public watchTowersERC20;
    
    function proposeWatcher (address _contract, address _newWatcher, uint256 _value, uint256 _withdrawalTimeout) public payable {
        require(_newWatcher != address(0), "invalid watcher address");
        require(watchTowersERC20[_contract][_newWatcher].deposit == 0, "watcher is already registered");
        require(_value > 0, "trasaction value must be greater then zero");
        
        IERC20(_contract).safeTransferFrom(msg.sender, address(this), _value);
        
        emit NewWatcherProposed(_contract, _newWatcher, _value, _withdrawalTimeout);
        
        watchTowersERC20[_contract][_newWatcher].deposit = _value;
        watchTowersERC20[_contract][_newWatcher].withdrawalTimeout = _withdrawalTimeout;
    }
    
    function acceptWatcher (address _contract, address _newWatcher) public onlyOwner {
        require(watchTowersERC20[_contract][_newWatcher].deposit > 0, "watcher does not exist");
        
        emit NewWatcherRegistered(_contract, _newWatcher);
        
        watchTowersERC20[_contract][_newWatcher].registered = true;
    }
    
    function deactivateWatcher (address _contract, address _watcher) public {
        require(msg.sender == _watcher || msg.sender == owner(), "sender is not authorised");
        require(watchTowersERC20[_contract][_watcher].deposit > 0, "watcher does not exist");
        
        emit WatcherRemoved(_contract, _watcher);
        
        watchTowersERC20[_contract][_watcher].registered = false;
        watchTowersERC20[_contract][_watcher].withdrawalTimestamp = block.timestamp.add(watchTowersERC20[_contract][msg.sender].withdrawalTimeout);
    }  
    
    function withdrawWatcher (address _contract) public nonReentrant {
        require(watchTowersERC20[_contract][msg.sender].deposit > 0, "watcher does not exist");
        require(watchTowersERC20[_contract][msg.sender].registered == false, "watcher is not deactivated");
        require(block.timestamp > watchTowersERC20[_contract][msg.sender].withdrawalTimestamp, "withdrawalTimestamp has not come");
        
        emit WatcherWithdrawn(_contract, msg.sender);
        
        msg.sender.transfer(watchTowersERC20[_contract][msg.sender].deposit);
        
        IERC20(_contract).safeTransfer(msg.sender, watchTowersERC20[_contract][msg.sender].deposit);
        
        delete watchTowersERC20[_contract][msg.sender];
    }
    
    function removeWatcher (address _contract, address _watcher) internal {
        require(watchTowersERC20[_contract][_watcher].deposit > 0, "watcher does not exist");
        require(watchTowersERC20[_contract][_watcher].registered == true, "watcher is not registered");

        emit WatcherRemoved(_contract, _watcher);
        
        IERC20(_contract).safeTransfer(msg.sender, watchTowersERC20[_contract][_watcher].deposit);
        
        delete watchTowersERC20[_contract][_watcher];
    }
}

contract Atomex is WatchTower {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    enum State { Empty, Initiated, Redeemed, Refunded }

    struct Swap {
        bytes32 hashedSecret;
        address contractAddr;
        address participant;
        address initiator;
        address watcher;
        uint256 refundTimestamp;
        uint256 watcherDeadline;
        uint256 value;
        uint256 payoff;
        State state;
    }

    event Initiated(
        bytes32 indexed _hashedSecret,
        address indexed _contract,
        address indexed _participant,
        address _initiator,
        address _watcher,
        uint256 _refundTimestamp,
        uint256 _watcherDeadline,
        uint256 _value,
        uint256 _payoff
    );

    event Added(
        bytes32 indexed _hashedSecret,
        address _sender,
        uint256 _value  
    );

    event Redeemed(
        bytes32 indexed _hashedSecret,
        bytes32 _secret
    );

    event Refunded(
        bytes32 indexed _hashedSecret
    );

    mapping(bytes32 => Swap) public swaps;

    modifier onlyByInitiator(bytes32 _hashedSecret) {
        require(msg.sender == swaps[_hashedSecret].initiator, "sender is not the initiator");
        _;
    }

    modifier isInitiatable(bytes32 _hashedSecret, address _participant, uint256 _refundTimestamp, uint256 _watcherDeadline) {
        require(_participant != address(0), "invalid participant address");
        require(swaps[_hashedSecret].state == State.Empty, "swap for this hash is already initiated");
        require(block.timestamp < _refundTimestamp, "refundTimestamp has already come");
        require(block.timestamp < _watcherDeadline, "watcherDeadline has already come");
        _;
    }

    modifier isInitiated(bytes32 _hashedSecret) {
        require(swaps[_hashedSecret].state == State.Initiated, "swap for this hash is empty or already spent");
        _;
    }

    modifier isAddable(bytes32 _hashedSecret) {
        require(block.timestamp < swaps[_hashedSecret].refundTimestamp, "refundTimestamp has already come");
        _;
    }

    modifier isRedeemable(bytes32 _hashedSecret, bytes32 _secret) {
        require(block.timestamp < swaps[_hashedSecret].refundTimestamp, "refundTimestamp has already come");
        require(sha256(abi.encodePacked(sha256(abi.encodePacked(_secret)))) == _hashedSecret, "secret is not correct");
        _;
    }

    modifier isRefundable(bytes32 _hashedSecret) {
        require(block.timestamp >= swaps[_hashedSecret].refundTimestamp, "refundTimestamp has not come");
        _;
    }

    function initiate (bytes32 _hashedSecret, address _contract, address _participant, address _watcher, 
        uint256 _refundTimestamp, uint256 _watcherDeadline, uint256 _value, uint256 _payoff)
        public nonReentrant isInitiatable(_hashedSecret, _participant, _refundTimestamp, _watcherDeadline)
    {
        IERC20(_contract).safeTransferFrom(msg.sender, address(this), _value);

        swaps[_hashedSecret].value = _value.sub(_payoff);
        swaps[_hashedSecret].hashedSecret = _hashedSecret;
        swaps[_hashedSecret].contractAddr = _contract;
        swaps[_hashedSecret].participant = _participant;
        swaps[_hashedSecret].initiator = msg.sender;
        swaps[_hashedSecret].watcher = _watcher;
        swaps[_hashedSecret].refundTimestamp = _refundTimestamp;
        swaps[_hashedSecret].watcherDeadline = _watcherDeadline;
        swaps[_hashedSecret].payoff = _payoff;
        swaps[_hashedSecret].state = State.Initiated;

        emit Initiated(
            _hashedSecret,
            _contract,
            _participant,
            msg.sender,
            _watcher,
            _refundTimestamp,
            _watcherDeadline,
            _value.sub(_payoff),
            _payoff
        );
    }

    function add (bytes32 _hashedSecret, uint _value)
        public nonReentrant isInitiated(_hashedSecret) isAddable(_hashedSecret)
    {
        IERC20(swaps[_hashedSecret].contractAddr)
            .safeTransferFrom(msg.sender, address(this), _value);

        swaps[_hashedSecret].value = swaps[_hashedSecret].value.add(_value);

        emit Added(
            _hashedSecret,
            msg.sender,
            swaps[_hashedSecret].value
        );
    }
  
    function withdraw(bytes32 _hashedSecret, address _contract, address _receiver, uint256 _watcherDeadLine, bool _slash) internal {
        if (msg.sender == swaps[_hashedSecret].watcher) {
            IERC20(swaps[_hashedSecret].contractAddr)
                .safeTransfer(_receiver, swaps[_hashedSecret].value);
            if(swaps[_hashedSecret].payoff > 0) {
                IERC20(swaps[_hashedSecret].contractAddr)
                    .safeTransfer(msg.sender, swaps[_hashedSecret].payoff);
            }
        }
        else if (block.timestamp > _watcherDeadLine && watchTowersERC20[_contract][msg.sender].registered == true) {
            IERC20(swaps[_hashedSecret].contractAddr)
                .safeTransfer(_receiver, swaps[_hashedSecret].value);
            if(swaps[_hashedSecret].payoff > 0) {
                IERC20(swaps[_hashedSecret].contractAddr)
                    .safeTransfer(msg.sender, swaps[_hashedSecret].payoff);
            }
            if(swaps[_hashedSecret].watcher != address(0) && _slash) {
                removeWatcher(_contract, swaps[_hashedSecret].watcher);
            }
        }
        else {
            IERC20(swaps[_hashedSecret].contractAddr)
                .safeTransfer(swaps[_hashedSecret].participant, swaps[_hashedSecret].value.add(swaps[_hashedSecret].payoff));
        }
        
        delete swaps[_hashedSecret];
    }

    function redeem(bytes32 _hashedSecret, bytes32 _secret, bool _slash)
        public nonReentrant isInitiated(_hashedSecret) isRedeemable(_hashedSecret, _secret)
    {
        swaps[_hashedSecret].state = State.Redeemed;

        withdraw(_hashedSecret, swaps[_hashedSecret].contractAddr, swaps[_hashedSecret].participant, swaps[_hashedSecret].watcherDeadline, _slash);
    
        emit Redeemed(
            _hashedSecret,
            _secret
        );
    }

    function refund(bytes32 _hashedSecret, bool _slash)
        public nonReentrant isInitiated(_hashedSecret) isRefundable(_hashedSecret)
    {
        swaps[_hashedSecret].state = State.Refunded;

        withdraw(_hashedSecret, swaps[_hashedSecret].contractAddr, swaps[_hashedSecret].initiator, swaps[_hashedSecret].watcherDeadline, _slash);

        emit Refunded(
            _hashedSecret
        );
    }
}