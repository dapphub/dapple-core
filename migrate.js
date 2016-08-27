var fs = require('./file.js');
var async = require('async');
var inquirer = require('inquirer');
var chain_expert = require('dapple-chain/lib/chain_expert.js');
var newChain = require('dapple-chain/lib/newChain.js');
var _ = require('lodash');
var userHome = require('user-home');
var path = require('path');
var Web3 = require('web3');
var deasync = require('deasync');

function analyzeRemoteChain(uri, name, callback) {
  var type;
  inquirer.prompt([{
    type: "confirm",
    name: "ok",
    message: `Analyzing chain "${name}", please make sure your chain is running at ${uri.host}:${uri.port}`
  }]).then((err, confirm) => {
    var web3 = new Web3(new Web3.providers.HttpProvider(`http://${uri.host}:${uri.port}`));
    return new Promise((resolve, reject) => {
      chain_expert.analyze(web3, (err, _type) => {
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
    if(fs.existsSync(dapplercPath)) {
      let dapplerc = fs.readYamlSync(dapplercPath);
      // TODO - filter values which are already in the global db
      var tasks = _.mapValues(dapplerc.environments, (env, name) => {
        if(env.ethereum === 'internal') {
          return 'internal';
        }
        var uri ={
          host: env.ethereum.host,
          port: env.ethereum.port
        };
        return uri;
      });
      // TODO - extend the env object with values from the global db if they exist
      var envs = deasync(async.mapValuesSeries.bind(async))(tasks, analyzeRemoteChain);
    } else {
      console.log('cannot find dapplerc');
    }

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
      let dappfile = fs.readYamlSync('dappfile');
        if('environments' in dappfile) {
          dappfile.environments =
            _.mapValues( dappfile.environments, (e, name) => {
              if(typeof e !== 'object') return null;
              var unknownChain = !(name in state.state.pointers && state.state.pointers[name].type !== 'UNKNOWN');
              if( name in envs && unknownChain) {
                state.state.pointers[name] = _.clone(envs[name])
              } else if(unknownChain && !(name in envs)) {
                state.state.pointers[name] = deasync(newChain)({name}, state).chainenv;
              }
              // Map context - objects
              if('objects' in e) {
                var values = _.mapValues( e.objects, o => ({
                    type: o.class,
                    value: o.address
                  }));
                  _.assign(state.state.pointers[name].env, values);
                return {
                  type: state.state.pointers[name].type,
                  objects: values
                };
              } else {
                return {};
              }
            })
          fs.renameSync('dappfile', 'dappfile.old');
        }
    }
    if(fs.existsSync('dapple_packages')) fs.renameSync('dapple_packages', '.dapple/packages')
    state.workspace.dappfile.layout.packages_directory = '.dapple/packages';
    state.saveState(true);
  }
}
