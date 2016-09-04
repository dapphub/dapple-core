var _ = require('lodash');
var fs = require('./file.js');
var writeYaml = require('write-yaml');
var path = require('path');

function export_sol(paths, state, pure) {
  var withEnv = !pure;
  var envs = JSON.parse(JSON.stringify(state.state.pointers));
  if(withEnv) envs.env = envs[state.state.head];
  var environments_init = Object.keys(envs).map(name => `  Environment ${name};`).join('\n');
  // TODO - test here wether two objects with the same name but different types exist
  var signatures = _.uniq(
    _.flatten(
      _.map(envs, env =>
        _.map(env.env, (obj, name) => {
          var type = obj.type.indexOf('[') > -1 ?
            obj.type.split('[')[0] : obj.type;
          return `    ${type} ${name};`;
        }
        )))).join('\n');
  var environment_spec =
    _.flatten(
      _.map(envs, (env, envName) =>
        _.map( env.env, (obj, name) => {
          var type = obj.type.indexOf('[') > -1 ?
            obj.type.split('[')[0] : obj.type;
            return `    ${envName}.${name} = ${type}(${obj.value});`;
        }))).join('\n');

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
    // TODO - reconsider
    var envs = _.mapValues(state.state.pointers, o => o.env);
    var env = state.state.pointers[state.state.head].env;
    var env_sol = export_sol([], state, true);
    var root = state.workspace.getPackageRoot();
    var build = state.workspace.dappfile.layout.build_dir;
    var p = path.join(root,build);
    state.workspace.dappfile.environments = envs;
    state.workspace.writeDappfile();
    // writeYaml.sync(path.join(p, 'environment.yaml'), envs);
    // fs.writeFileSync(path.join(p, 'environment.json'), JSON.stringify(envs,false,2));
    // fs.writeFileSync(path.join(p, 'environment.sol'), env_sol);
  },
  export_sol
}
