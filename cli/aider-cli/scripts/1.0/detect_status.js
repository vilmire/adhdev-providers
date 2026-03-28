/**
 * Aider — detect_status
 * Aider uses a simpler TUI with '>' prompts and tool output markers.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    // Aider approval: "Allow creation of new file" / "Run shell command?"
    if (/Allow\s*creation/i.test(tail) && /\(y\/n\)/i.test(tail)) return 'waiting_approval';
    if (/Run\s*shell\s*command/i.test(tail)) return 'waiting_approval';
    if (/Apply\s*(edit|change)/i.test(tail) && /\(y\/n\)/i.test(tail)) return 'waiting_approval';
    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/Thinking|Sending|Streaming/i.test(tail)) return 'generating';
    // Aider shows "Tokens:" after completion — if we see that, it's idle
    if (/Tokens:/i.test(tail)) return 'idle';
    return 'idle';
};
