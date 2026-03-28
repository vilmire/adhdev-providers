'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    const hasApproval = /execute\s*command/i.test(tail) || /\(y\/n\)/i.test(tail) || /\[Y\/n\]/i.test(tail);
    if (!hasApproval) return null;
    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Execute command?', buttons: ['Yes', 'No'] };
};
