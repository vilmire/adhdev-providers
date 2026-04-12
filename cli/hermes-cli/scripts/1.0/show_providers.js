'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function showProviders() {
  return buildPtyWrite('/provider');
};
