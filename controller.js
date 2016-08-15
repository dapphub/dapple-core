var Formatters = require('./formatters.js');

module.exports = {
  cli: function (cli, workspace, state) {
    if(cli.status) {
      console.log(Formatters.status(state.state));
    }
  }
}
