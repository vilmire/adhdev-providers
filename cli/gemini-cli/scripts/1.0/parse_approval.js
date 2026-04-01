/**
 * Gemini CLI — parse_approval
 * Input:  { buffer: string, tail: string }
 * Output: { message: string, buttons: string[] } | null
 */
'use strict';
module.exports = function parseApproval(input) {
    const screenText = String(input?.screenText || '');
    const text = String(screenText || input?.buffer || input?.tail || '');
    if (!text) return null;

    const allLines = text.split(/\r\n|\n|\r/g).map(line => line.trim()).filter(Boolean);
    let lastPromptIndex = -1;
    for (let index = allLines.length - 1; index >= 0; index -= 1) {
        if (/^>\s*$/.test(allLines[index]) || /[›❯]\s*$/.test(allLines[index]) || /Type your message/i.test(allLines[index])) {
            lastPromptIndex = index;
            break;
        }
    }
    if (lastPromptIndex >= 0) {
        const afterPrompt = allLines.slice(lastPromptIndex + 1).join('\n');
        if (!/Allow\s*once/i.test(afterPrompt)
            && !/Always\s*allow/i.test(afterPrompt)
            && !/Run\s*this\s*command/i.test(afterPrompt)
            && !/\(y\/n\)/i.test(afterPrompt)
            && !/\[Y\/n\]/i.test(afterPrompt)) {
            return null;
        }
    }

    const recent = text.split('\n').slice(-18).join('\n');

    const hasApproval =
        /Allow\s*once/i.test(recent) || /Always\s*allow/i.test(recent) ||
        /Run\s*this\s*command/i.test(recent) || /Deny/i.test(recent) ||
        /\(y\/n\)/i.test(recent) || /\[Y\/n\]/i.test(recent);
    if (!hasApproval) return null;

    const lines = recent.split('\n').map(l => l.trim()).filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));
    return {
        message: lines.slice(-5).join(' ').slice(0, 200) || 'Approval required',
        buttons: ['Allow (y)', 'Always allow (a)', 'Deny (n)'],
    };
};
