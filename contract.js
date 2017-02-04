'use strict';

var _ = require('lodash');
var sha3 = require('web3/lib/utils/sha3.js');
var utils = require('web3/lib/utils/utils.js');
var LogTranslator = require('./logtranslator.js');
var coder = require('web3/lib/solidity/coder.js');

class Contract {
  static create (classDefinition) {
    if (!('bytecode' in classDefinition) && !('bin' in classDefinition)) {
      throw new Error('Test class definition has no bytecode');
    }

    if (!('interface' in classDefinition) && !('abi' in classDefinition)) {
      throw new Error('Test class definition has no interface');
    }

    return new Contract(classDefinition);
  }

  constructor (classDefinition, name) {
    if ('bin' in classDefinition) {
      this.abi = classDefinition.abi || classDefinition.interface;
    } else {
      this.abi = classDefinition.interface || classDefinition.abi;
    }

    if (typeof (this.abi) === 'string') {
      this.abi = JSON.parse(this.abi);
    }
    this.abiString = JSON.stringify(this.abi);
    this.bytecode = classDefinition.bytecode || classDefinition.bin;
    this.asm = classDefinition.asm;
    this.opcodes = classDefinition.opcodes;
    this.runtimeBytecode = classDefinition.runtimeBytecode;
    this.classId = sha3(this.bytecode);
    this.rtcodeId = sha3(this.runtimeBytecode);
    this.name = name;
    this.logtr = new LogTranslator(this.abi);
    this.signatures_to_fabi = {"": {}};
    this.abi
    .forEach(abi => {
      abi.inputs && (abi.decodeInputs = (data) => coder.decodeParams(abi.inputs.map(i => i.type), data).map(p => p.toString()));
      abi.outputs && (abi.decodeOutputs = (data) => coder.decodeParams(abi.outputs.map(i => i.type), data).map(p => p.toString()));
      abi.outputs && (abi.encodeOutputs = (data) => coder.encodeParams(abi.outputs.map(i => i.type), data));
      abi.inputs && (abi.encodeInputs = (data) => coder.encodeParams(abi.inputs.map(i => i.type), data));
      let signature;
      switch (abi.type) {
        case 'constructor':
        case 'fallback':
          signature = abi.type;
          break;
        default:
          signature = sha3(utils.transformToFullName(abi)).slice(0,8);
      }
      abi.signature = signature;
      this.signatures_to_fabi[signature] = abi;
    });

    Contract.map[this.classId] = this;
    // TODO - learn about inheritance
    // TODO - learn about source files
    // TODO - learn about solidity version and flags
  }

  get signatures () {
    // filter out the constructor and return the signatures of the contract
    return _.map(_.filter(this.abi, i => i.type !== 'constructor'), o => {
      var types = _.map(o.inputs, 'type').join(',');
      return o.name + '(' + types + ')';
    });
  }
}
Contract.map = {};

module.exports = Contract;
