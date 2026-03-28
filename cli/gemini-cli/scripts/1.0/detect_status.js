/**
 * Gemini CLI — detect_status
 * Input:  { tail: string }
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';

    // waiting_approval
    if (/Allow\s*once/i.test(tail) || /Always\s*allow/i.test(tail)) return 'waiting_approval';
    if (/\(y\/n\)/i.test(tail) || /\[Y\/n\]/i.test(tail)) return 'waiting_approval';
    if (/Run\s*this\s*command/i.test(tail)) return 'waiting_approval';
    if (/Deny/i.test(tail) && /Allow/i.test(tail)) return 'waiting_approval';
    if (/auto-?approve/i.test(tail) && /Deny/i.test(tail)) return 'waiting_approval';

    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[▀▄▌▐░▒▓█]/.test(tail)) return 'generating';
    if (/Thinking/i.test(tail)) return 'generating';
    if (/Generating/i.test(tail)) return 'generating';
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';

    return 'idle';
};
