'use strict';

const parseOutput = require('./parse_output.js');

module.exports = function parseSession(input) {
    const output = parseOutput(input || {});
    const status = typeof output?.status === 'string' ? output.status : 'idle';
    return {
        status,
        messages: Array.isArray(output?.messages) ? output.messages : [],
        modal: output?.activeModal || output?.modal || null,
        parsedStatus: status || null,
    };
};
