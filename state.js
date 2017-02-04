'use strict';
var levelup = require('levelup');
var userHome = require('user-home');
var path = require('path');
// TODO - make dappleChain loading asynchronous or initialize it back with a callback
var DappleChain = require('dapple-chain/lib/blockchain.js');
var DapphubInterface = require('dapple-chain/lib/dapphubInterface.js');
var chain = require('dapple-chain');
var async = require('async');
var fs = require('./file.js');
var exporter = require('./export.js');
var _ = require('lodash');
var Web3 = require('web3');
var migrate = require('./migrate.js');
var Wallet = require('ethereumjs-wallet');
var semver = require('semver');
var initialglobalstate = require('./initialglobalstate.js');
var gmigrate = require("./global_migration.js");
var lmigrate = require("./local_migration.js");


class State {
  constructor(cliSpec, cb) {
    if(State.singleton) return State.singleton;
    State.singleton = this;
    this.modules = {};
    this.cliSpec = cliSpec;
    // Setup dapple if this is the first run
  }

  initWorkspace( workspace, callback ) {
    // TODO - this may be hacky. initWorkspace shouldnt be called in the first place if no workspace is found.
    var initGlobalState = (cb) => {
      let config_path = path.join(userHome, '.dapple', 'config');
      if(!fs.existsSync(path.join(userHome, '.dapple', 'config'))) {
        this.wallet = Wallet.generate();
        this._global_state = initialglobalstate;
        this._global_state.state.nss_account = this.wallet.getPrivateKey()
        fs.mkdirp.sync(path.join(userHome, '.dapple'));
        fs.writeFileSync(config_path, JSON.stringify(this._global_state, false, 2));
      } else {
        this._global_state = gmigrate(JSON.parse(fs.readFileSync(config_path)), config_path, this.dapple_version);
        this.wallet = Wallet.fromPrivateKey(new Buffer(this._global_state.state.nss_account, 'hex'));
      }
      cb();
    };
    var initLocalDb = this.initLocalDb.bind(this, workspace.package_root);
    async.waterfall([
      // initGlobalDb,
      initGlobalState,
      initLocalDb
    ], (err) => {
      if(err) throw new Error(err);
      this.workspace = workspace;
      this.initEnvironments(workspace.dappfile.environments);
      this.workspace._dappfile = lmigrate(this.workspace._dappfile, this.dapple_version, this);
      callback();
    });
  }

  initEnvironments (environments) {
    _.each(environments, (env, name) => {
      if(name in this.state.pointers) {
        this.state.pointers[name].env = env.objects;
      } else {
        this.state.pointers[name] = {
          env: env.objects,
          type: "UNKNOWN"
        };
        console.log(`WARN: you seem to have no chain named ${name}!`);
      }
    });
  }

  initLocalDb(package_root, cb) {
    let localdbPath = path.join(package_root,'.dapple/chain_db');

    if(!fs.existsSync(path.join(package_root, '.dapple'))) {
      fs.mkdirp.sync(path.join(package_root, '.dapple'));
      fs.appendFileSync(path.join(package_root, '.gitignore'), "**/chain_db/");
    }
    var handleState = (cb, err, state) => {
      if(err && err.type === 'NotFoundError') {
        this.createState(() => {
          var chainenv = this.state.pointers[this.state.head];
          cb(null, chainenv);
        });
      } else {
        this.state = state;
        var chainenv = this.state.pointers[this.state.head];
        cb(null, chainenv);
      }
    }

    async.waterfall([
      levelup.bind(this, localdbPath),
      (db, cb) => { this.db = db; cb(null, db); },
      (db, cb) => { db.get('state', {valueEncoding: 'json'}, handleState.bind(this, cb)) }
    ], (err, chainenv) => {
      if(err) throw err;

        cb( null, this);
    });
  }


  exportEnvironment () {
    exporter.environment(this);
  }

  saveState(persistent) {
    // TODO - async
    if(this.mode === 'persistent' || persistent) {
      if(this.workspace) {
        this.workspace.dappfile.dapple_version = semver.clean(this.dapple_version);
        this.workspace.dappfile.environments =
          _.mapValues(this.state.pointers, p => ({
            objects: p.env || {},
            type: p.type,
            chain: p.chain || ""
          }) );
        this.workspace.writeDappfile();
      }
      this.db.put('state', this.state, {valueEncoding: 'json'});
    }
  }

  createState (cb) {
    this.state = { pointers: {} };
    this.createChain("develop", cb);
  }

  // TODO - refactor this to chain?
  createChain (name, cb) {
    chain.initNew(this.db, [], (err, chainenv) => {
      this.state.head = name;
      this.state.pointers[name] = chainenv;
      this.saveState(true);
      cb(null, chainenv);
    });
  }

  // TODO - diferentiate on chain type - refactr dhInterface
  forkLiveChain (name, type, callback) {
    var dhInterface;
    dhInterface = new DapphubInterface();
    dhInterface.initDb(this.db);
    dhInterface.forkLatest(type, callback);
  }

  // Returns a json object out of the global database
  getJSON(key, cb) {
    cb(null, this._global_state[key]);
    // this.globalDb.get(key, {valueEncoding: 'json'}, cb);
  }

  saveGlobalState() {
    fs.writeFileSync(path.join(userHome, '.dapple', 'config'), JSON.stringify(this._global_state, false, 2));
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

  addNetwork(obj, cb) {
    this._global_state.networks[obj.name] = obj.chainenv;
    this.saveGlobalState();
    cb();
  }

  getRemoteWeb3Interface(type, callback) {

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
    var filterType = chainenv => { return chainenv.type === type.replace(/\x00/g,'') };

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
