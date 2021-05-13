// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// From file: openzeppelin-contracts/contracts/math/SafeMath.sol
library SafeMath {
    function add(uint256 a, uint256 b) internal pure returns (uint256 c) {
        c = a + b;
        require(c >= a, "SafeMath add wrong value");
        return c;
    }
    function sub(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b <= a, "SafeMath sub wrong value");
        return a - b;
    }
    function div(uint256 a, uint256 b) internal pure returns (uint256) {
        // assert(b > 0); // Solidity automatically throws when dividing by 0
        // uint256 c = a / b;
        // assert(a == b * c + a % b); // There is no case in which this doesn't hold
        return a / b;
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

// From file: OpenZeppelin/openzeppelin-contracts/contracts/security/ReentrancyGuard.sol
abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    uint256 private _status;

    constructor () {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

contract Atomex is ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    enum State { Empty, Initiated, Redeemed, Refunded, Missed }

    struct Swap {
        bytes32 id;
        address contractAddr;
        address payable initiator;
        address payable participant;
        uint256 amountIn;
        uint256 amountOut;
        State state;
    }
    
    event Initiated(
        bytes32 indexed _swapId,
        address indexed _contract,
        address indexed _participant,
        address _initiator,
        uint256 _valueIn
    );

    event Swapped(
        bytes32 indexed _swapId
    );

    event Refunded(
        bytes32 indexed _swapId
    );
    
    mapping(bytes32 => Swap) public swaps;

    modifier isInitiatable(address _participant) {
        require(_participant != address(0), "invalid participant address");
        _;
    }

    modifier isInitiated(bytes32 _swapId) {
        require(swaps[_swapId].state == State.Initiated, "swap for this ID is empty or already spent");
        _;
    }
    
    function multikey(bytes32 _hashedSecret, address _initiator) public pure returns(bytes32) {
        return sha256(abi.encodePacked(_hashedSecret, _initiator));
    }

    function initiateEthToToken(
        bytes32 _id, address _contract, address _participant, uint256 _minTokensOut)
        public payable nonReentrant isInitiatable(_participant)
    {
        bytes32 swapId = multikey(_id, msg.sender);
        
        require(swaps[swapId].state == State.Empty, "swap for this hash is already initiated");
   
        Swap storage newSwap = swaps[swapId];

        newSwap.id = _id;
        newSwap.participant = payable(_participant);
        newSwap.initiator = payable(msg.sender);
        newSwap.amountIn = msg.value;
        newSwap.amountOut = _minTokensOut;
        newSwap.state = State.Initiated;

        emit Initiated(
            swapId,
            _contract,
            _participant,
            msg.sender,
            msg.value
        );
    }
    
    function initiateTokenToEth(
        bytes32 _id, address _contract, address _participant, uint256 _tokensIn, uint256 _minEthOut)
        public payable nonReentrant isInitiatable(_participant)
    {
        bytes32 swapId = multikey(_id, msg.sender);
        
        require(swaps[swapId].state == State.Empty, "swap for this hash is already initiated");
        
        IERC20(_contract).safeTransferFrom(msg.sender, address(this), _tokensIn);
   
        Swap storage newSwap = swaps[swapId];

        newSwap.id = _id;   
        newSwap.participant = payable(_participant);
        newSwap.initiator = payable(msg.sender);
        newSwap.amountIn = _tokensIn;
        newSwap.amountOut = _minEthOut;
        newSwap.state = State.Initiated;

        emit Initiated(
            swapId,
            _contract,
            _participant,
            msg.sender,
            _tokensIn
        );
    }

    function withdrawEth(bytes32 _swapId, address payable _receiver) internal 
    {
        _receiver.transfer(swaps[_swapId].amountIn);

        delete swaps[_swapId];
    }
    
    function withdrawTokens(bytes32 _swapId, address _receiver) internal 
    {
        IERC20(swaps[_swapId].contractAddr).safeTransfer(_receiver, swaps[_swapId].amountIn);

        delete swaps[_swapId];
    }
    
    function swapTokenToEth(bytes32 _swapId, address _contract, uint256 _tokensIn, uint256 _minEthOut)
        public nonReentrant isInitiated(_swapId)
    {
        require (_tokensIn >= swaps[_swapId].amountOut, "tokens input amount is less than required");
        require (_minEthOut <= swaps[_swapId].amountIn, "eth output amount is less than required");
        
        IERC20(_contract).safeTransferFrom(msg.sender, swaps[_swapId].initiator, _tokensIn);
        
        emit Swapped(
            _swapId
        );
        
        withdrawEth(_swapId, swaps[_swapId].participant);
    }
    
    
    function swapEthToTokens(bytes32 _swapId, uint256 _ethIn, uint256 _minTokensOut)
        public nonReentrant isInitiated(_swapId)
    {
        require (_ethIn >= swaps[_swapId].amountOut, "eth input amount is less than required");
        require (_minTokensOut <= swaps[_swapId].amountIn, "tokens output amount is less than required");
        
        swaps[_swapId].initiator.transfer(_ethIn);
        
        emit Swapped(
            _swapId
        );
        
        withdrawTokens(_swapId, swaps[_swapId].participant);
    }

    function refundEth(bytes32 _swapId)
        public isInitiated(_swapId)
    {
        swaps[_swapId].state = State.Refunded;

        emit Refunded(
            _swapId
        );
        
        withdrawEth(_swapId, swaps[_swapId].initiator);
    }

    function refundTokens(bytes32 _swapId)
        public isInitiated(_swapId)
    {
        swaps[_swapId].state = State.Refunded;

        emit Refunded(
            _swapId
        );
        
        withdrawTokens(_swapId, swaps[_swapId].initiator);
    }
}