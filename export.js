var _ = require('lodash');
var fs = require('./file.js');

function export_sol(paths, state) {
  var envs = JSON.parse(JSON.stringify(state.state.pointers));
  envs.env = envs[state.state.head];
  var environments_init = Object.keys(envs).map(name => `  Environment ${name};`).join('\n');
  // TODO - test here wether two objects with the same name but different types exist
  var signatures = _.uniq(
    _.flatten(
      _.map(envs, env =>
        _.map(env.env, (obj, name) =>
          `    ${obj.type} ${name};`
        )))).join('\n');
  var environment_spec =
    _.flatten(
      _.map(envs, (env, envName) =>
        _.map( env.env, (obj, name) => `    ${envName}.${name} = ${obj.type}(${obj.value});`))).join('\n');

  var template = _.template(fs.readFileStringSync(__dirname + '/spec/env.sol'));
  var imports = paths.map(p => `import "${p}";`).join('\n');
  var compiledFile = template({
    imports,
    signatures,
    environments_init,
    environment_spec
  });
  return compiledFile;
}

module.exports = {
  environment: (state) => {
    var env = state.state.pointers[state.state.head].env;
    console.log(JSON.stringify(env,false,2));
  },
  export_sol
}
