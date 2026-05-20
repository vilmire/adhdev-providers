'use strict';

const parseOutput = require('./parse_output.js');

module.exports = function parseSession(input) {
  return parseOutput(input);
};