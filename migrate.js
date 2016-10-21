var fs = require('./file.js');
var async = require('async');
var inquirer = require('inquirer');
var chain_expert = require('./chain_expert.js');
var newChain = require('./newChain.js');
var _ = require('lodash');
var userHome = require('user-home');
var path = require('path');
var Web3 = require('web3');
var deasync = require('deasync');
var clc = require('cli-color-tty')(true);

function analyzeRemoteChain(chaintypes, uri, name, callback) {
  var type;
  inquirer.prompt([{
    type: "confirm",
    name: "ok",
    message: `Analyzing chain "${name}", please make sure your chain is running at ${uri.host}:${uri.port}`
  }]).then((err, confirm) => {
    var web3 = new Web3(new Web3.providers.HttpProvider(`http://${uri.host}:${uri.port}`));
    return new Promise((resolve, reject) => {
      chain_expert.analyze(chaintypes, web3, (err, _type) => {
        type = _type;
        if(err) return reject(err);
        web3.eth.getAccounts((err, accounts) => {
          if(err) return reject(err);
          return resolve(accounts);
        });
      });
    });
  }).then((accounts) => {
    return inquirer.prompt([{
      type: "list",
      name: "account",
      message: "default account:",
      choices: accounts
    }]);
  }).then((account) => {
    callback(null, {
      branch: false,
      env: {},
      network: {
        host: uri.host,
        port: uri.port
      },
      type: type,
      defaultAccount: account.account,
      devmode: false,
      conrifmationBlocks: 1
    });
  }).catch((e) => {
    console.log(e);
  });
}

module.exports = {

  handler: function (state) {
    var dapplercPath = path.join(userHome, '.dapplerc');
    // migrate dapplerc
    if(!fs.existsSync(dapplercPath)) {
      console.log('cannot find dapplerc, aborting!');
      process.exit();
    }

    state.getJSON('networks', (err, networks) => {

      let dapplerc = fs.readYamlSync(dapplercPath);

      let ported = _.pick(dapplerc.environments, Object.keys(networks));

      let toPort = dapplerc.environments && _.omit(dapplerc.environments, Object.keys(networks)) || {};

      if(Object.keys(toPort).length > 0) {
        console.log(`Found new environments to port: ${Object.keys(toPort)}`);
      }
      var tasks = _.mapValues(toPort, (env, name) => {
        console.log(`Porting ${name}`);
        if(!env ||
          typeof env !== "object" ||
          !("ethereum" in env) ||
          env.ethereum === 'internal') {
            console.log(`  assign internal chain to ${name}`);
          return 'internal';
        }
        var uri ={
          host: env.ethereum.host,
          port: env.ethereum.port
        };
        return uri;
      });

      // Ommit migrateion of internal environments
      tasks = _.omitBy(tasks, v => v === 'internal');

      var chaintypes = state._global_state.chaintypes;
      analyzeRemoteChain = analyzeRemoteChain.bind(this, chaintypes);
      // TODO - extend the env object with values from the global db if they exist
      async.mapValuesSeries(tasks, analyzeRemoteChain, (err, envs) => {
        if (err) throw new Error(err);
        var _toAddTasks = _.map(envs, (chainenv, name) => {
          return (cb) => {
            state.addNetwork({name, chainenv}, cb); }
        });

        async.series(_toAddTasks, (err) => {
          if(err) throw new Error(err);
          _.assign(envs, networks);

          function fileExistsWithCaseSync(filepath) {
            var dir = path.dirname(filepath);
            if (dir === '/' || dir === '.') return true;
            var filenames = fs.readdirSync(dir);
            if (filenames.indexOf(path.basename(filepath)) === - 1) {
              return false;
            }
            return fileExistsWithCaseSync(dir);
          }

          if(fileExistsWithCaseSync(process.cwd()+'/dappfile')) {
            var dappfile = fs.readYamlSync('dappfile');
            if('environments' in dappfile) {
              dappfile.environments =
                _.mapValues( dappfile.environments, (e, name) => {
                  if(typeof e !== 'object') return null;

                  var unknownChain = !(name in envs && envs[name].type !== 'UNKNOWN');

                  if( name in envs && unknownChain) {
                    envs[name] = _.clone(envs[name])
                  } else if(unknownChain && !(name in envs)) {
                    envs[name] = deasync(newChain)({name}, state).chainenv;
                  }
                  // Map context - objects
                  if('objects' in e) {
                    var values = _.mapValues( e.objects, o => ({
                      type: o.class,
                      value: o.address
                    }));
                    _.assign(envs[name].env, values);
                    return {
                      type: envs[name].type,
                      objects: values
                    };
                  } else {
                    return {};
                  }
                })
              fs.renameSync('dappfile', 'dappfile.old');
              // state.state.env = dappfile.environments;
              state.state.pointers = _.pickBy(envs, (env, name) => name in dappfile.environments);
              // state.state.pointers = _.mapValues(dappfile.environments, env => ({env: env.objects, type: env.type}));
              state.state.head = Object.keys(state.state.pointers)[0];
            }
          }
          console.log('default packages directory is now ./.dapple/packages');
          if(fs.existsSync('dapple_packages')) {
            console.log('think about migrating your dapple_packages dirctory manually');
            state.workspace.dappfile.layout.packages_directory = 'dapple_packages';
          } else {
            state.workspace.dappfile.layout.packages_directory = '.dapple/packages';
          }
          state.saveState(true);
        });
      });
    });
  }
}
