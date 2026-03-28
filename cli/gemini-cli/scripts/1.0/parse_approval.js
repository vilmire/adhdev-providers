/**
 * Gemini CLI — parse_approval
 * Input:  { buffer: string, tail: string }
 * Output: { message: string, buttons: string[] } | null
 */
'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;

    const hasApproval =
        /Allow\s*once/i.test(tail) || /Always\s*allow/i.test(tail) ||
        /Run\s*this\s*command/i.test(tail) || /Deny/i.test(tail) ||
        /\(y\/n\)/i.test(tail) || /\[Y\/n\]/i.test(tail);
    if (!hasApproval) return null;

    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return {
        message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required',
        buttons: ['Allow (y)', 'Always allow (a)', 'Deny (n)'],
    };
};
