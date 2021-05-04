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
  function mul(uint256 a, uint256 b) internal pure returns (uint256 c) {
    if (a == 0) {
      return 0;
    }
    c = a * b;
    assert(c / a == b);
    return c;
  }
  function div(uint256 a, uint256 b) internal pure returns (uint256) {
    // assert(b > 0); // Solidity automatically throws when dividing by 0
    // uint256 c = a / b;
    // assert(a == b * c + a % b); // There is no case in which this doesn't hold
    return a / b;
  }
}

abstract contract Ownable {

  address private _owner;
  address private _successor;

  event OwnershipTransferred(address previousOwner, address newOwner);
  event NewOwnerProposed(address previousOwner, address newOwner);

  constructor() {
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
    require(msg.sender == owner());
    _;
  }

  modifier onlySuccessor() {
    require(msg.sender == successor());
    _;
  }

  function proposeOwner(address newOwner) public onlyOwner {
    require(newOwner != address(0));
    emit NewOwnerProposed(owner(), newOwner);
    setSuccessor(newOwner);
  }

  function acceptOwnership() public onlySuccessor {
    emit OwnershipTransferred(owner(), successor());
    setOwner(successor());
  }
}

abstract contract ERC20Basic {
    function totalSupply() virtual public view returns (uint256);
    function balanceOf(address who) virtual public view returns (uint256);
    function transfer(address to, uint256 value) virtual public returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
}

abstract contract ERC20 is ERC20Basic {
    function allowance(address owner, address spender) virtual public view returns (uint256);
    function transferFrom(address from, address to, uint256 value) virtual public returns (bool);
    function approve(address spender, uint256 value) virtual public returns (bool);
	event Approval(
	    address indexed owner,
	    address indexed spender,
	    uint256 value
    );
}

contract FiatTokenV1 is Ownable, ERC20 {
    using SafeMath for uint256;

    string public name;
    string public symbol;
    uint8 public decimals;
    string public currency;
    address public masterMinter;
    bool internal initialized;

    mapping(address => uint256) internal balances;
    mapping(address => mapping(address => uint256)) internal allowed;
    uint256 internal totalSupply_ = 0;
    mapping(address => bool) internal minters;
    mapping(address => uint256) internal minterAllowed;

    event Mint(address indexed minter, address indexed to, uint256 amount);
    event Burn(address indexed burner, uint256 amount);
    event MinterConfigured(address indexed minter, uint256 minterAllowedAmount);
    event MinterRemoved(address indexed oldMinter);
    event MasterMinterChanged(address indexed newMasterMinter);

    function initialize(
        string memory _name,
        string memory _symbol,
        string memory _currency,
        uint8 _decimals,
        address _masterMinter,
        address _owner
    ) public {
        require(!initialized);
        require(_masterMinter != address(0));
        require(_owner != address(0));

        name = _name;
        symbol = _symbol;
        currency = _currency;
        decimals = _decimals;
        masterMinter = _masterMinter;
        setOwner(_owner);
        initialized = true;
    }

    modifier onlyMinters() {
        require(minters[msg.sender] == true);
        _;
    }

    function mint(address _to, uint256 _amount) public onlyMinters returns (bool) {
        require(_to != address(0));
        require(_amount > 0);

        uint256 mintingAllowedAmount = minterAllowed[msg.sender];
        require(_amount <= mintingAllowedAmount);

        totalSupply_ = totalSupply_.add(_amount);
        balances[_to] = balances[_to].add(_amount);
        minterAllowed[msg.sender] = mintingAllowedAmount.sub(_amount);
        emit Mint(msg.sender, _to, _amount);
        emit Transfer(address(0), _to, _amount);
        return true;
    }

    modifier onlyMasterMinter() {
        require(msg.sender == masterMinter);
        _;
    }

    function minterAllowance(address minter) public view returns (uint256) {
        return minterAllowed[minter];
    }

    function isMinter(address account) public view returns (bool) {
        return minters[account];
    }

    function allowance(address owner, address spender) override public view returns (uint256) {
        return allowed[owner][spender];
    }

    function totalSupply() override public view returns (uint256) {
        return totalSupply_;
    }

    function balanceOf(address account) override public view returns (uint256) {
        return balances[account];
    }

    function approve(address _spender, uint256 _value) override public returns (bool) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) override public returns (bool) {
        require(_to != address(0));
        require(_value <= balances[_from]);
        require(_value <= allowed[_from][msg.sender]);

        balances[_from] = balances[_from].sub(_value);
        balances[_to] = balances[_to].add(_value);
        allowed[_from][msg.sender] = allowed[_from][msg.sender].sub(_value);
        emit Transfer(_from, _to, _value);
        return true;
    }

    function transfer(address _to, uint256 _value) override public returns (bool) {
        require(_to != address(0));
        require(_value <= balances[msg.sender]);

        balances[msg.sender] = balances[msg.sender].sub(_value);
        balances[_to] = balances[_to].add(_value);
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    function configureMinter(address minter, uint256 minterAllowedAmount) onlyMasterMinter public returns (bool) {
        minters[minter] = true;
        minterAllowed[minter] = minterAllowedAmount;
        emit MinterConfigured(minter, minterAllowedAmount);
        return true;
    }

    function removeMinter(address minter) onlyMasterMinter public returns (bool) {
        minters[minter] = false;
        minterAllowed[minter] = 0;
        emit MinterRemoved(minter);
        return true;
    }

    function burn(uint256 _amount) public onlyMinters {
        uint256 balance = balances[msg.sender];
        require(_amount > 0);
        require(balance >= _amount);

        totalSupply_ = totalSupply_.sub(_amount);
        balances[msg.sender] = balance.sub(_amount);
        emit Burn(msg.sender, _amount);
        emit Transfer(msg.sender, address(0), _amount);
    }

    function updateMasterMinter(address _newMasterMinter) public onlyOwner {
        require(_newMasterMinter != address(0));
        masterMinter = _newMasterMinter;
        emit MasterMinterChanged(masterMinter);
    }
}