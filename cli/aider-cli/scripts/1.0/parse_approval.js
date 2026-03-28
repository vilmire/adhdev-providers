'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    const hasApproval = /Allow\s*creation/i.test(tail) || /Run\s*shell\s*command/i.test(tail) ||
        /Apply\s*(edit|change)/i.test(tail) || /\(y\/n\)/i.test(tail);
    if (!hasApproval) return null;
    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && l.length > 2);
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required', buttons: ['Yes (y)', 'No (n)'] };
};
