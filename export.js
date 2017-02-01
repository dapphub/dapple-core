var _ = require('lodash');
var fs = require('./file.js');
var writeYaml = require('write-yaml');
var path = require('path');

function export_sol(paths, state, pure) {
  var withEnv = !pure;

  var dtree = state.workspace.buildDappfileTree(paths.filter(p => /dappfile$/.test(p.toLowerCase())), state.state.head);

  // var envs = JSON.parse(JSON.stringify(state.state.pointers));
  var envs = dtree.environments || {};
  if(withEnv && state.state.head in envs) envs.env = envs[state.state.head];
  var environments_init = Object.keys(envs).map(name => `  Environment ${name};`).join('\n');
  // TODO - test here wether two objects with the same name but different types exist

  var genSignatures = (dtree) => {
    var envmap =
      _.map(dtree.environments, env =>
        _.map(env.objects, (obj, name) => {
          var type = obj.type.indexOf('[') > -1 ?
            obj.type.split('[')[0] : obj.type;
          return `    ${type} ${name};`;
        }));
    if("subEnvs" in dtree) {
      return envmap.concat(_.map(dtree.subEnvs,genSignatures));
    } else {
      return envmap;
    }
  }

  var signatures = _.uniq(
    _.flattenDeep(
      genSignatures(dtree)
    )
  ).join('\n') + "\n    mapping (bytes32 => Environment) pkg;\n";

  var genEnvSpec = (dtree, prefix, groupType) =>
    _.flatten(
      _.map(dtree.environments, (env, envName) => {
        if( groupType != null && env.type !== groupType) {
          return null;
        }
        return _.map( env.objects, (obj, name) => {
          var type = obj.type.indexOf('[') > -1 ?
            obj.type.split('[')[0] : obj.type;
            return `    ${prefix}${groupType != null ? '' : envName + '.'}${name} = ${type}(${obj.value.toUpperCase()});`;
        })
        .concat( "subEnvs" in dtree ? _.map(dtree.subEnvs, (_dtree, pkgName) => {
          return genEnvSpec(_dtree, `${prefix.length > 0 ? prefix : envName + '.'}pkg["${pkgName}"].`, env.type);
        }) : [] )}).filter(e => e !== null)).join('\n');
  var environment_spec = genEnvSpec(dtree, "");

  var template = _.template(fs.readFileStringSync(__dirname + '/spec/env.sol'));

  var imports = paths
  .filter(p => /\.sol$/.test(p))
  .map(p => `import "${p}";`)
  .join('\n');


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
