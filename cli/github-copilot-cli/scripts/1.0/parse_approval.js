'use strict';
module.exports = function parseApproval(input) {
    const { tail } = input;
    if (!tail) return null;
    const text = String(tail);
    if (/Confirm folder trust/i.test(text) || /Do you trust the files in this folder\?/i.test(text)) {
        return {
            message: 'Confirm folder trust',
            buttons: ['Yes', 'Yes, remember', 'No']
        };
    }
    const hasApproval = /execute\s*command/i.test(text) || /\(y\/n\)/i.test(text) || /\[Y\/n\]/i.test(text);
    if (!hasApproval) return null;
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return { message: lines.slice(-5).join(' ').slice(0, 200) || 'Execute command?', buttons: ['Yes', 'No'] };
};
