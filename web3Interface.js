'use strict';

// TODO - refactor this, maybe with promisses the structure gets simpler

var Web3Factory = require('./web3Factory.js');
var deasync = require('deasync');
var createNewChain = require('dapple-chain/lib/createNewChain.js');
var levelup = require('levelup');
var memdown = require('memdown');

const DEFAULT_GAS = 3141592;

// TODO - refactor this to pure chainenv
class Web3Interface {

  constructor (opts, web3) {
    this._gas = DEFAULT_GAS;
    this.chainenv = opts.chainenv;
    this.filterCallbacks = [];
    this.supervisor = opts.supervisor;

    if (web3) {
      this._web3 = web3;
    } else if (opts.chainenv.type === 'internal') {
      Web3Factory.EVM(opts, (err, web3) => {
        if (err) throw new Error(err);
        this._web3 = web3;
      });
    } else if (opts.type === 'tmp') {
      // TODO - in memory database has problems with dapplechain.runBlock
      // var db = levelup('/tmp', { db: require('memdown') }, (err, db) => {
      // opts.db = opts.db;
      var addr = opts.chainenv.defaultAccount;
      var chaindata = createNewChain(opts.db, [addr]);
      var chainenv = {
        branch: true,
        meta: chaindata.meta,
        stateRoot: chaindata.stateRoot,
        fakedOwnership: [addr],
        defaultAccount: addr,
        env: {},
        devmode: true,
        type: "internal",
        confirmationBlocks: 0
      }
      this.chainenv = opts.chainenv = chainenv;

      Web3Factory.EVM(opts, (err, web3) => {
        if (err) throw new Error(err);
        this._web3 = web3;
      });
    } else {
      this._web3 = Web3Factory.JSONRPC(opts);
      var block = this._web3.eth.getBlock('latest');
      this._gas = block.gasLimit;
    }
    deasync.loopWhile(() => { return typeof this._web3 !== 'object'; });
    this._web3.eth.getBlock(0, (err, res) => {
      if (err) throw new Error(err);
      this._block0 = res;
    });
    // this._tasks = {};
  }

  // returns an address of a deployed contract given a transaction hash
  getDeployReceiptSync (txHash) {
    var self = this;
    var fSync = deasync(function (cb) {
      self._web3.eth.getTransactionReceipt(txHash, function (err, receipt) {
        if (err) {
          cb(err);
        }
        if (!receipt || !receipt.contractAddress) return null;
        cb(null, receipt);
      });
    });
    return fSync();
  }

  waitForBlock (blockNumber, cb) {
    var self = this;
    var watch = (err, result) => {
      if (err) {
        this.removeOnBlock(watch);
        return cb(err);
      }
      var currentBlockNumber = self._web3.eth.blockNumber;
      if( currentBlockNumber >= blockNumber ) {
        this.removeOnBlock(watch);
        return cb();
      } else {
        this.setStatus(`waiting ${blockNumber - currentBlockNumberk} blocks`);
      }
    };
    this.onBlock(watch);
  }

  getCode (address) {
    var self = this;
    var fSync = deasync(function (cb) {
      self._web3.eth.getCode(address, function (err, res) {
        if (err) {
          return cb(err);
        }
        cb(null, res);
      });
    });
    return fSync();
  }

  confirmCode (address) {
    var code = this.getCode(address);

    if (typeof code === 'string' && code.length > 2) {
      return true;
    }
    throw new Error('could not verify contract');
  }

  // deploys a contract async
  //
  // opts.abi:  aplication binary interface
  // opts.bytecode : contract bytecode
  // opts.className: Class Name
  // opts.args: constructor args
  //
  deploy (opts) {
    // TODO - check wih json schema
    var Class = this._web3.eth.contract(opts.abi);
    // Concates the constructor arguments to the binary data for the deploy
    // TODO - test with atoms
    // TODO - refactor the arg mapping outside of deploy
    var args = opts.args.concat([ { data: opts.bytecode } ]);
    // TODO - typecheck parametery against the abi
    var data = Class.new.getData.apply(this, args);
    var address = this._web3.eth.defaultAccount;
    var receipt;
    var txHash;
    var self = this;
    var _filter = this._web3.eth.filter('latest', function (err, result) {
      if (err) throw err;
      if (!txHash) return null;
      // var _receipt = self.getDeployReceiptSync( txHash );
      self._web3.eth.getTransactionReceipt(txHash, function (err, _receipt) {
        if (err) {
          _filter.stopWatching();
          throw err;
        }
        if (!_receipt || !_receipt.contractAddress) return null;
        _filter.stopWatching();
        self._web3.eth.getCode(_receipt.contractAddress, (err, code) => {
          if (err) throw new Error(err);
          if (/^0x0*$/.test(code)) {
            throw new Error(`Could not deploy contract ${opts.className}. ` +
                            `Transaction went through, but there is no code ` +
                            `at contract address ${_receipt.contractAddress}`);
          }
          receipt = _receipt;
        });
      });
    });
    // TODO - hack
    address = this._web3.eth.coinbase;
    this._web3.eth.sendTransaction({
      from: address,
      data: data,
      gas: opts.gas || this._gas
    // gas: 895807
    }, function (err, _txHash) {
      if (err) {
        _filter.stopWatching();
        throw err;
      }
      // Check if the transaction got rejected
      if ((/^0x0*$/).test(_txHash)) {
        _filter.stopWatching();
        throw new Error(`Could not deploy contract ${opts.className}, ` +
                        `maybe the gas is too low.`);
      }
      txHash = _txHash;
    });
    deasync.loopWhile(function () { return typeof receipt !== 'object'; });
    return receipt;
  }

  // Calls a function
  // opts.constant: if a function is to be called constant
  // opts.fName: function Name
  // opts.args: arguments to giv during the call
  // opts.abi
  // opts.address
  call (opts) {
    var Class = this._web3.eth.contract(opts.abi);
    var object = Class.at(opts.address);
    var txHash;
    var result;
    var self = this;
    if (!opts.constant) {
      var _filter = this._web3.eth.filter('latest', function (err, res) {
        if (err) throw err;
        if (!txHash) return null;
        self._web3.eth.getTransactionReceipt(txHash, function (err, _receipt) {
          if (err) throw err;
          if (!_receipt) return null;
          result = _receipt;
        });
      });
    }
    opts.txOptions.from = this._web3.eth.coinbase;
    object[opts.fName]
    .apply(this,
           opts.args.concat([
             opts.txOptions || {},
             function (err, res) {
               if (err) throw err;
               if (opts.constant) {
                 result = res;
               } else {
                 txHash = res;
               }
             }]));
    deasync.loopWhile(function () { return typeof result === 'undefined'; });
    if (typeof _filter === 'object') _filter.stopWatching();
    return result;
  }

  runFilter () {
    this._filter = this._web3.eth.filter('latest', (err, res) => {
      if (err) throw err;
      this.filterCallbacks.forEach(f => f());
    });
  }

  stopFilter () {
    this._filter.stopWatching();
  }

  onBlock (f) {
    if(this.filterCallbacks.indexOf(f) === -1) {
      this.filterCallbacks.push(f);
    }
  }

  removeOnBlock(f) {
    let num = this.filterCallbacks.indexOf(f);
    if(num > -1) this.filterCallbacks.splice(num, 1);
  }

  // @param opts
  //    co - transaction object
  tx (co, cb) {
    var txHash = null;
    var watch = (err, res) => {
      if (err) throw err;
      if (!txHash) return null;
      getTxReceipt();
    };
    var called = false;
    var getTxReceipt = (installWatcher) => {
      this._web3.eth.getTransactionReceipt(txHash, (err, _receipt) => {
        if (err) throw err;
        if (called) return null;
        if (!_receipt) {
          this.setStatus(`waiting for transaction ${txHash} to get included`);
          if(typeof installWatcher === 'function') installWatcher();
          return null;
        }
        this.setStatus(`${this.chainenv.confirmationBlocks} blocks confirmation left`);
        this.removeOnBlock(watch);
        called = true;
        return cb(null, _receipt); // TODO - ERROR - callback was already called
      });
    }
    this.setStatus('sending transaction');
    this._web3.eth.sendTransaction(co, (err, hash) => {
      // TODO - handle error
      txHash = hash;
      getTxReceipt(() => {
        this.onBlock(watch);
      });
    });
  }

  confirmTx(receipt, cb) {
    if( this.chainenv.confirmationBlocks === 0 ) {
      cb(null, receipt)
    } else {
      this.waitForBlock(receipt.blockNumber + this.chainenv.confirmationBlocks, (err) => {
        this._web3.eth.getTransactionReceipt(receipt.transactionHash, (err, r2) => {
          if( r2.blockHash === receipt.blockHash ) {
            cb(err, receipt);
          } else {
            cb(new Error('TODO - block hash differ, renew confirmation'));
          }
        });
      });
    }
  }

  setStatus (status) {
    if(this.supervisor) this.supervisor.setStatus(status);
  }

}

module.exports = Web3Interface;
