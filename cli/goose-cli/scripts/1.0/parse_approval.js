'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    if (/Share anonymous usage data to help improve goose\?/i.test(tail)) {
        return {
            message: 'Share anonymous usage data to help improve goose?',
            buttons: ['Yes', 'No']
        };
    }
    const hasApproval = (/approve|confirm/i.test(tail) && /deny|cancel/i.test(tail)) ||
        /\(y\/n\)/i.test(tail) || /Allow.*tool/i.test(tail);
    if (!hasApproval) return null;
    const lines = tail.split('\n').map(l => l.trim()).filter(l => l && l.length > 2);
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required', buttons: ['Approve', 'Deny'] };
};
