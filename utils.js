"use strict";
var fs = require('./file.js');
var clc = require('cli-color-tty')(true);

module.exports = {
  optionalCallback: function (cb) {
    if (typeof (cb) === 'undefined') {
      cb = function (err, result) {
        if (err) { throw err; }
        return result;
      };
    }
    return cb;
  },

  classToFilename: function (className) {
    var filename = '';
    for (var i = 0; i < className.length; i++) {
      if (i !== 0 && className[i] !== className[i].toLowerCase()) {
        filename += '_';
      }
      filename += className[i].toLowerCase();
    }
    return filename + '.sol';
  },

// Builds the docopt usage from the spec
  getUsage: function (cliSpec) {
    const usage =
      '    ' +
      cliSpec.commands
        .map(c => `dapple ${c.name} ${c.options.map(o => o.name).join(' ')}`)
        .join('\n    ');
    const options =
      '    ' +
      cliSpec.options
        .map(o => o.name)
        .join('\n    ');
    return `Usage:\n${usage}\n\nOptions:\n${options}`;
  },

  getHelp: function (dappledir, cliSpec, packageSpec) {
    var build = '';
    try {
    if (fs.existsSync(dappledir + '/../.git') && fs.existsSync(dappledir + '/../.git/HEAD')) {
      // get the package HEAD hash to identify the version
      let ref = fs.readFileSync(dappledir + '/../.git/HEAD').toString().split(/\s/)[1];
      build = '-' + fs.readFileSync(dappledir + `/../.git/${ref}`).toString().slice(0, 10);
    }
    } catch (e) {
    }
    // apend the charactar `char` to a given string to match the desired length `number`
    const appendChar = (str, char, number) => {
      for (let i = str.length; i < number; i++) { str += char; }
      return str;
    };

    const longestOption =
      Math.max.apply(this, cliSpec.commands.map(c => Math.max.apply(this, c.options.map(o => o.name.length))));

      const usage = cliSpec.commands
      .map(c => {
        let options = c
        .options.map(o => clc.bold(appendChar(o.name, ' ', longestOption + 4)) + o.summary);
        let required = c.options.filter(o => /^\s*\</.test(o.name)).map(o => o.name).join(' ');
        if (options.length > 0) options.push('');
        return `${appendChar(clc.green('dapple ' + c.name) + ' ' + required + ' ', ' ', longestOption + 18)}${c.summary}\n        ${options.join('\n        ')}`;
      });

      const options =
        cliSpec.options
        .map(o => o.name);

        console.log(`dapple version: ${packageSpec.version}${build}\n\nUSAGE: dapple COMMAND [OPTIONS]\n\nCOMMANDS:\n    ${usage.join('\n    ')}\n\nOPTIONS:\n    ${options.join('\n     ')}`);

  }
};
