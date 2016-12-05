"use strict";

var semver = require('semver');
var fs = require('fs');

module.exports = (gstate, path, dapple_version) => {
  let version = gstate.dapple_version;
  let changed = false;

  var migrate = (change_version, msg, f) => {
    if(!version || semver.lte(version, change_version)) {
      console.log(`MIGRAE: ${change_version} - ${msg}`);
      changed = true;
      f();
    }
  }

  migrate("0.8.37", 'adding ROPSTEN chaintype to global config', () => {
    // adding RPOSTEN to chaintypes
    gstate.chaintypes.ROPSTEN = {
      genesis: "0x41941023680923e0fe4d74a34bdac8141f2540e3ae90623718e47d66d1ca4a2d"
    }
  });

  if (changed) {
    gstate.dapple_version = dapple_version;
    fs.writeFileSync(path, JSON.stringify(gstate));
  }
  return gstate;
}
