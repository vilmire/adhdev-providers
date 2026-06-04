'use strict';

const parseOutput = require('./parse_output.js');
const { wrapParseOutputAsSession } = require('../../../_shared/parse_session.js');

module.exports = wrapParseOutputAsSession(parseOutput);
