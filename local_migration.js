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

  // migrate("0.8.37", "exchange chain type with BIP122 URI", () => {
  //   
  // });


  migrate("0.8.37", "add ./ prefix to layouts in case its missing", () => {
    dappfile.layout = _.mapValues(dappfile.layout, (path, name) => {
      if(!/\.\//.test(path)) return "./" + path;
      return path;
    })
  })

  if (changed) {
    state.saveState(true);
    // console.log(dappfile);
    // gstate.dapple_version = dapple_version;
    // fs.writeFileSync(path, JSON.stringify(gstate));
  }
  return dappfile;
}
