'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function retryLast() {
  return buildPtyWrite('/retry');
};
