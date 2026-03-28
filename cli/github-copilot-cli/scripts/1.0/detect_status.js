/**
 * GitHub Copilot CLI — detect_status
 * `gh copilot` uses a conversational interface.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    // waiting_approval
    if (/execute\s*command/i.test(tail) && /\[Y\/n\]/i.test(tail)) return 'waiting_approval';
    if (/approve|confirm/i.test(tail) && /\(y\/n\)/i.test(tail)) return 'waiting_approval';
    if (/Run\s*this/i.test(tail) && /deny|cancel|no/i.test(tail)) return 'waiting_approval';
    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/thinking|generating|processing/i.test(tail)) return 'generating';
    if (/\.{3,}$/.test(tail.trim())) return 'generating';
    return 'idle';
};
