'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function newSession() {
  return buildPtyWrite('/new', {
    sessionEvent: 'new_session',
    historyMessageCount: 0,
  });
};
