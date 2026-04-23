/**
 * Cursor CLI — detect_status
 * Cursor's terminal agent uses similar TUI patterns to Claude.
 */
'use strict';

const { parseApprovalContext } = require('./approval_helpers.js');

module.exports = function detectStatus(input) {
    const tail = String(input?.tail || input?.screenText || input?.buffer || '');
    if (!tail) return 'idle';

    if (parseApprovalContext(input)) return 'waiting_approval';

    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (/\b(?:thinking|processing|generating|working|analyzing|planning|reading|searching|editing|running|composing)\b/i.test(tail)) return 'generating';
    if (/esc to (?:cancel|interrupt|stop)/i.test(tail)) return 'generating';
    return 'idle';
};
