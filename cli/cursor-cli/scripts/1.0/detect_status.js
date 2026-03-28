/**
 * Cursor CLI — detect_status
 * Cursor's terminal agent uses similar TUI patterns to Claude.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    // waiting_approval
    if (/Allow\s*once/i.test(tail) || /Always\s*allow/i.test(tail)) return 'waiting_approval';
    if (/\(y\/n\)/i.test(tail) || /\[Y\/n\]/i.test(tail)) return 'waiting_approval';
    if (/approve|confirm/i.test(tail) && /deny|cancel/i.test(tail)) return 'waiting_approval';
    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/thinking|processing|generating/i.test(tail)) return 'generating';
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';
    return 'idle';
};
