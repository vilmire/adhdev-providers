/**
 * OpenCode CLI — detect_status
 * OpenCode uses a TUI that resembles a chat interface.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    if (/Allow|Deny|approve|reject/i.test(tail) && /\(y\/n\)|confirm/i.test(tail)) return 'waiting_approval';
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/thinking|generating|processing|running/i.test(tail)) return 'generating';
    if (/esc to (cancel|stop)/i.test(tail)) return 'generating';
    return 'idle';
};
