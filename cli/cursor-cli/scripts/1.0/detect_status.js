/**
 * Cursor CLI — detect_status
 * Cursor's terminal agent uses similar TUI patterns to Claude.
 */
'use strict';

const { parseApprovalContext } = require('./approval_helpers.js');

const IDLE_PROMPT_RE = /(^|\n)\s*[▶→❯›>]\s*(?:Plan, search, build anything|Add a follow-up)\b/im;
const ACTIVE_GENERATION_RE = /ctrl\+c\s+to\s+stop/i;
const TRANSIENT_STATUS_RE = /\b(?:thinking|processing|generating|working|analyzing|planning|reading|searching|editing|running|composing)\b/i;

module.exports = function detectStatus(input) {
    const tail = String(input?.tail || input?.screenText || input?.buffer || '');
    const screenText = String(input?.screenText || input?.buffer || tail);
    if (!tail && !screenText) return 'idle';

    if (parseApprovalContext(input)) return 'waiting_approval';

    const visibleIdlePrompt = IDLE_PROMPT_RE.test(screenText);
    const visibleActiveGeneration = ACTIVE_GENERATION_RE.test(screenText);

    if (visibleIdlePrompt && !visibleActiveGeneration) {
        return 'idle';
    }

    if (/[\u2800-\u28ff]/.test(tail)) return 'generating';
    if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(tail)) return 'generating';
    if (TRANSIENT_STATUS_RE.test(tail)) return 'generating';
    if (/esc to (?:cancel|interrupt|stop)/i.test(tail)) return 'generating';
    return 'idle';
};
