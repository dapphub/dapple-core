var Formatters = require('./formatters.js');
var newChain = require('./newChain.js');

module.exports = {
  cli: function (cli, workspace, state) {
    if(cli.status) {
      console.log(Formatters.status(state.state));
    } else if(cli.export) {
      state.exportEnvironment();
    } else if(cli.migrate) {
      state.migrate();
    } else if(cli.chain && cli.new) {
      this.new(state, cli);
    }
  },

  // Create a new environment
  new: function (state, cli) {

    var name = cli['<name>'];

    var chains = Object.keys(state.state.pointers);

    if(chains.indexOf(name) > -1) {
      console.log(`Error: Chain ${name} is already known, please choose another name.`);
      process.exit();
    }

    newChain({name}, state, (err, chaindata) => {
      if(typeof chaindata === 'string') return true;
      state.state.pointers[chaindata.name] = chaindata.chainenv;
      state.state.head = chaindata.name;
      state.saveState(true);
    });
  },
}
