'use strict';

const { parseApprovalContext } = require('./approval_helpers.js');

module.exports = function parseApproval(input) {
    const approval = parseApprovalContext(input);
    if (!approval) return null;
    return {
        message: approval.message,
        buttons: approval.buttons,
    };
};
