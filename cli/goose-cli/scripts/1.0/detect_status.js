/**
 * Goose — detect_status
 * Goose is an autonomous AI agent that uses MCP and tools.
 * It typically shows 'thinking...' and uses tool calls.
 */
'use strict';
module.exports = function detectStatus(input) {
    const { tail } = input;
    if (!tail) return 'idle';
    // Goose approval
    if (/approve|confirm/i.test(tail) && /deny|cancel/i.test(tail)) return 'waiting_approval';
    if (/\(y\/n\)/i.test(tail)) return 'waiting_approval';
    if (/Allow.*tool/i.test(tail)) return 'waiting_approval';
    // generating
    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/thinking|processing|working|running/i.test(tail)) return 'generating';
    if (/─.*tool.*─/i.test(tail)) return 'generating';
    return 'idle';
};
