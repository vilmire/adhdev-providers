'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function rollbackList() {
  return buildPtyWrite('/rollback');
};
