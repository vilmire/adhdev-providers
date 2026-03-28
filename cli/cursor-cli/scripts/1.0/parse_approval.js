'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    const hasApproval = /Allow\s*once/i.test(tail) || /Always\s*allow/i.test(tail) ||
        /\(y\/n\)/i.test(tail) || (/approve/i.test(tail) && /deny/i.test(tail));
    if (!hasApproval) return null;
    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required', buttons: ['Allow', 'Always allow', 'Deny'] };
};
