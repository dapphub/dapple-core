var Formatters = require('./formatters.js');

module.exports = {
  cli: function (cli, workspace, state) {
    if(cli.status) {
      console.log(Formatters.status(state.state));
    } else if(cli.export) {
      state.exportEnvironment();
    } else if(cli.migrate) {
      state.migrate();
    }
  }
}
