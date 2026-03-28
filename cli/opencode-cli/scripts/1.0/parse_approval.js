'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    const hasApproval = /Allow|approve/i.test(tail) && /Deny|reject/i.test(tail);
    if (!hasApproval && !/\(y\/n\)/i.test(tail)) return null;
    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required', buttons: ['Allow', 'Deny'] };
};
