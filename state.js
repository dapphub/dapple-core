'use strict';
var levelup = require('levelup');
var userHome = require('user-home');
var path = require('path');
var deasync = require('deasync');
var DappleChain = require('dapple-chain/lib/blockchain.js');
var createNewChain = require('dapple-chain/lib/createNewChain.js');
var async = require('async');

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

  initLocalDb(package_root) {
    var rdy = false;
    let localdbPath = path.join(package_root,'.dapple/chain_db');

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
        this.chain = new DappleChain({
          db: this.db,
          chainenv
        });
      }
      rdy = true;
    });
    deasync.loopWhile(() => {return !rdy; });

  }

  saveState(persistent) {
    // TODO - async
    if(this.mode === 'persistent' || persistent) {
      deasync(this.db.put).apply(this.db, ['state', this.state, {valueEncoding: 'json'}]);
    }
  }

  createState () {
    this.state = { pointers: {} };
    this.createChain("master");
  }

  // TODO - refactor this to chain
  createChain (name) {
    var chaindata = createNewChain(this.db);
    this.state.head = name;
    this.state.pointers[name] = {
      branch: true,
      meta: chaindata.meta,
      stateRoot: chaindata.stateRoot,
      fakedOwnership: ['0x0000000000000000000000000000000000000000'],
      defaultAccount: '0x0000000000000000000000000000000000000000',
      devmode: true,
      type: "internal"
    };
    this.saveState(true);
  }

  forkLiveChain (name) {
    var env = deasync(this.chain.dhInterface.forkLatest.bind(this.chain.dhInterface))();
    this.state.pointers[name] = env;
    this.saveState(true);
  }


  getJSON(key, cb) {
    this.globalDb.get(key, {valueEncoding: 'json'}, cb);
  }

  registerModule(module) {
    this.modules[module.name] = module;
    let prefixedCommands = module.cliSpec.commands.map(cmd => {
      cmd.name = module.name + ' ' + cmd.name;
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

}
State.singleton = null;

module.exports = State;
