'use strict';
var levelup = require('levelup');
var userHome = require('user-home');
var path = require('path');
var deasync = require('deasync');
var DappleChain = require('dapple-chain/lib/blockchain.js');
var DapphubInterface = require('dapple-chain/lib/dapphubInterface.js');
var chain = require('dapple-chain');
var async = require('async');
var fs = require('./file.js');
var exporter = require('./export.js');
var _ = require('lodash');
var Web3 = require('web3');
var migrate = require('./migrate.js');

class State {
  constructor(cliSpec) {
    if(State.singleton) return State.singleton;
    State.singleton = this;
    this.modules = {};
    this.cliSpec = cliSpec;
    var rdy = false;
    // Setup dapple if this is the first run
    this.globalDb = levelup(path.join(userHome, '.dapple'), (err, res) => {
      if(err) throw err;
      this.globalDb.get('state', (err, res) => {
        if(err && err.type === 'NotFoundError') {
          this.globalDb.batch([
            {key: "state", value: {}},
            {key: "networks", value: {}}
          ], {valueEncoding: 'json'}, () => {
            rdy = true;
          });
        } else {
          rdy = true;
        }
      });
    });
    deasync.loopWhile(() => { return !rdy; });
  }

  initWorkspace( workspace ) {
    this.initLocalDb( workspace.package_root );
    this.workspace = workspace;
    // TODO - enabje this
    // this.initEnvironments(workspace.dappfile.environments);
  }

  initEnvironments (environments) {
    _.each(environments, (env, name) => {
      _.assign( this.state.pointers[name].env, env);
    });
  }

  initLocalDb(package_root) {
    var rdy = false;
    let localdbPath = path.join(package_root,'.dapple/chain_db');

    if(!fs.existsSync(path.join(package_root, '.dapple'))) {
      fs.mkdirp(path.join(package_root, '.dapple'));
    }
    var handleState = (cb, err, state) => {
      if(err && err.type === 'NotFoundError') {
        this.createState();
      } else {
        this.state = state;
      }
      var chainenv = this.state.pointers[this.state.head];
      cb(null, chainenv);
    }

    async.waterfall([
      levelup.bind(this, localdbPath),
      (db, cb) => { this.db = db; cb(null, db); },
      (db, cb) => { db.get('state', {valueEncoding: 'json'}, handleState.bind(this, cb)) }
    ], (err, chainenv) => {
      if(err) throw err;

      if( chainenv.type === 'internal' ) {
        this.initChain(chainenv);
      }
      rdy = true;
    });
    deasync.loopWhile(() => {return !rdy; });

  }

  initChain (chainenv) {
    this.chain = new DappleChain({
      db: this.db,
      chainenv
    });
  }

  exportEnvironment () {
    exporter.environment(this);
  }

  saveState(persistent) {
    // TODO - async
    if(this.mode === 'persistent' || persistent) {
      if(this.workspace) {
        this.workspace.dappfile.environments =
          _.mapValues(this.state.pointers, p => ({objects: p.env||{}, type: p.type}) );
        this.workspace.writeDappfile();
      }
      deasync(this.db.put).apply(this.db, ['state', this.state, {valueEncoding: 'json'}]);
    }
  }

  createState () {
    this.state = { pointers: {} };
    this.createChain("master");
  }

  // TODO - refactor this to chain?
  createChain (name) {
    var chainenv = chain.initNew(this.db);
    this.state.head = name;
    this.state.pointers[name] = chainenv;
    this.saveState(true);
  }

  // TODO - diferentiate on chain type - refactr dhInterface
  forkLiveChain (name, type, callback) {
    var dhInterface;
    if(!this.chain) {
      dhInterface = new DapphubInterface();
      dhInterface.initDb(this.db);
    } else {
      dhInterface = this.chain.dhInterface;
    }
    dhInterface.forkLatest(type, callback);
  }

  // Returns a json object out of the global database
  getJSON(key, cb) {
    this.globalDb.get(key, {valueEncoding: 'json'}, cb);
  }

  registerModule(module) {
    this.modules[module.name] = module;
    let prefixedCommands = module.cliSpec.commands.map(cmd => {
      if(module.name != 'core' && module.name != cmd.name) {
        cmd.name = module.name + ' ' + cmd.name;
      }
      return cmd;
    });
    // add command line operations to dapples cli
    this.cliSpec.commands = this.cliSpec.commands.concat(prefixedCommands);
  }

  addNetwork(name, obj, cb) {
    this.globalDb.get('networks', {valueEncoding: 'json'}, (err, networks) => {
      networks[name] = obj;
      this.globalDb.put('networks', networks, {valueEncoding: 'json'}, cb);
    });
  }

  getRemoteWeb3(type, callback) {

    // See if the chain is online
    function pingChain(chainenv, cb) {
      var web3 = new Web3(new Web3.providers.HttpProvider(`http://${chainenv.network.host}:${chainenv.network.port}`));
      if(web3.isConnected()) {cb(null, web3, chainenv)}
    }
    // see if the defaultAccount has enough balance to proceed the transaction
    function getBalance(web3, chainenv, cb) {cb(null, web3, chainenv);}
    // see if the defaultAccount is actually unlocked
    function testUnlocked(web3, chainenv, cb) {cb(null, web3, chainenv);}

    // go and get all chains of the desired type:
    var filterType = chainenv => chainenv.type === type;
    // build tasklist - try to find an accessable chain
    var candidates = _.filter(this.state.pointers, filterType)
    .map(chainenv => async.waterfall.bind(async, [
      pingChain.bind(this, chainenv),
      getBalance,
      testUnlocked
    ]));

    // as fast as it can
    async.race(candidates, callback);
  }

  migrate() {
    migrate.handler(this);
  }


}
State.singleton = null;

module.exports = State;
