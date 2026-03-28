/**
 * Claude Code — detect_status
 *
 * Lightweight status detection for high-frequency polling.
 * Input:  { tail: string }  — last ~500 chars of ANSI-stripped PTY output
 * Output: 'idle' | 'generating' | 'waiting_approval'
 */

'use strict';

module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';

    // ─── waiting_approval (highest priority) ───
    // Claude Code approval menu items
    if (/Allow\s*once/i.test(tail) || /Always\s*allow/i.test(tail)) return 'waiting_approval';
    if (/\(y\/n\)/i.test(tail) || /\[Y\/n\]/i.test(tail)) return 'waiting_approval';

    // ─── generating ───
    // Braille spinner characters (universal TUI spinner)
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    // Status line indicators
    if (/esc to (cancel|interrupt|stop)/i.test(tail)) return 'generating';
    if (/generating\.\.\./i.test(tail)) return 'generating';
    if (/Claude is (?:thinking|processing|working)/i.test(tail)) return 'generating';
    if (/Flummoxing/i.test(tail)) return 'generating';

    // ─── idle ───
    return 'idle';
};
