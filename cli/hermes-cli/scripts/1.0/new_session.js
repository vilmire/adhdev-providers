'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function newSession() {
  return buildPtyWrite('/new\r/status', {
    sessionEvent: 'new_session',
    historyMessageCount: 0,
  });
};
