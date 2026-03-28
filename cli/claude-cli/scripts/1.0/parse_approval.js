/**
 * Claude Code — parse_approval
 *
 * Extract approval modal info from PTY output.
 * Input:  { buffer: string, tail: string }
 * Output: { message: string, buttons: string[] } | null
 */

'use strict';

module.exports = function parseApproval(input) {
    const { buffer, tail } = input;
    const check = tail || (buffer || '').slice(-800);
    if (!check) return null;

    // Claude Code approval patterns
    const hasApproval =
        /Allow\s*once/i.test(check) ||
        /Always\s*allow/i.test(check) ||
        /\(y\/n\)/i.test(check) ||
        /\[Y\/n\]/i.test(check);

    if (!hasApproval) return null;

    // Extract context message (last few meaningful lines before the approval)
    const lines = check.split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^[─═╭╮╰╯│]+$/.test(l));

    const message = lines.slice(-5).join(' ').slice(0, 200) || 'Approval required';

    // Claude Code-specific button labels
    // These map to approvalKeys in provider.json: { "0": "1", "1": "2", "2": "3" }
    return {
        message,
        buttons: ['Yes (y)', 'Always allow (a)', 'Deny (Esc)'],
    };
};
