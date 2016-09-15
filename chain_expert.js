"use strict";

module.exports = {
  // add a new environment
  analyze: (chaintypes, web3, cb) => {
    web3.version.getNode((err, res) => {
      if(err || !res) return cb(err);
      if(res.toLowerCase().indexOf('testrpc') > -1) {
        return cb(null, 'TestRPC');
      } else {
        web3.eth.getBlock(0, (err, block) => {
          if(err || !block) return cb(err);
          if( block.hash === chaintypes.ETH.genesis ) { // livenet
            web3.eth.getBlock(2000000, (err, block2) => {
              if(err || !block2) return cb(new Error('Cannot get block 2.000.000'));
              if( block2.hash === chaintypes.ETH.block2m) {
                return cb(null, 'ETH');
              } else if (block2.hash === chaintypes.ETC.block2m) {
                return cb(null, 'ETC');
              } else {
                return cb(new Error('Unknown chain'));
              }
            });
          } else if( block.hash === chaintypes.MORDEN.genesis) { // morden
            return cb(null, 'MORDEN');
          } else { // custom
            return cb(null, 'CUSTOM', block.hash);
          }
        });
      }
    });
  }
};
