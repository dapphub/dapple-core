"use strict";

var semver = require('semver');
var fs = require('fs');
var _ = require('lodash');

module.exports = (dappfile, dapple_version, state) => {
  let version = dappfile.dapple_version;
  let changed = false;

  var migrate = (change_version, msg, f) => {
    if(!version || semver.lte(version, change_version)) {
      console.log(`MIGRAE: ${change_version} - ${msg}`);
      changed = true;
      f();
    }
  }

  migrate("0.8.37", 'add possible missing fields to Dappfile - authors, licence - Apache-2.0, ...', () => {
    _.defaults(dappfile, {
      description: '',
      authors: [],
      license: 'Apache-2.0',
      keywords: ["dapple"]
    });
  });

  migrate("0.8.37", "add ./ prefix to layouts in case its missing", () => {
    dappfile.layout = _.mapValues(dappfile.layout, (path, name) => {
      if(!/\.\//.test(path)) return "./" + path;
      return path;
    })
  })

  // migrate("0.8.39", "change chaintypes for BIP122 URI's", () => {
  //   const chaintypes = state._global_state.chaintypes;
  //   Object.keys(dappfile.environments)
  //   .forEach(name => {
  //     let env = dappfile.environments[name];
  //     let chainObject = chaintypes[env.type];
  //     if(chainObject) {
  //       let chain_id = chainObject.genesis.slice(2);
  //       let block_hash = (chainObject.block2m && chainObject.block2m.slice(2)) || chain_id;
  //       env.chain = `blockchain://${chain_id}/block/${block_hash}`
  //       delete env.type
  //       dappfile.environments[name] = env;
  //     }
  //   })
  // })

  if (changed) {
    state.saveState(true);
    // gstate.dapple_version = dapple_version;
    // fs.writeFileSync(path, JSON.stringify(gstate));
  }
  return dappfile;
}
