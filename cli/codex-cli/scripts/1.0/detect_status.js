/**
 * Codex CLI — detect_status
 * OpenAI Codex CLI uses a different TUI pattern.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';

    // waiting_approval
    if (/approve|deny|allow|reject/i.test(tail) && /\[.*\]/i.test(tail)) return 'waiting_approval';
    if (/Run command/i.test(tail) && /\(y\/n\)/i.test(tail)) return 'waiting_approval';

    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/thinking|processing|running/i.test(tail)) return 'generating';

    return 'idle';
};
