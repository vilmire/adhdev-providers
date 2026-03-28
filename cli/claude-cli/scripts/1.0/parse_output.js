/**
 * Claude Code — parse_output
 *
 * Full PTY buffer → ReadChatResult conversion.
 * Called less frequently than detectStatus (on demand, not polling).
 *
 * Input: {
 *   buffer: string,       // Full ANSI-stripped accumulated PTY output
 *   rawBuffer: string,    // Raw PTY output (with ANSI)
 *   recentBuffer: string, // Recent 1000 chars (ANSI-stripped)
 *   messages: Array,      // Previously parsed messages (for delta)
 *   partialResponse: string, // Current partial response being generated
 * }
 *
 * Output: ReadChatResult {
 *   messages: [{ id, role, content, index, kind?, meta? }],
 *   status: AgentStatus,
 *   activeModal?: ModalInfo | null,
 *   title?: string,
 * }
 */

'use strict';

const detectStatus  = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');

/**
 * Heuristic turn splitter for Claude Code terminal output.
 *
 * Claude Code uses a structured TUI with box-drawing characters.
 * User prompts appear after '❯' or '>' markers.
 * Assistant responses follow in the main content area.
 */
function splitTurns(buffer) {
    const messages = [];
    if (!buffer || buffer.length < 5) return messages;

    const lines = buffer.split('\n');
    let currentRole = null;
    let currentContent = [];
    let msgIndex = 0;

    // Skip startup banner (everything before first prompt marker)
    let started = false;

    for (const line of lines) {
        const trimmed = line.trim();

        // Detect user input lines (Claude Code prompt markers)
        // Patterns: "❯ user text", "> user text", "$ user text" from prompt
        const userMatch = trimmed.match(/^[❯›>]\s+(.+)$/);
        if (userMatch && userMatch[1].length > 1) {
            started = true;
            // Flush previous
            if (currentRole && currentContent.length > 0) {
                const text = currentContent.join('\n').trim();
                if (text.length > 1) {
                    messages.push({
                        id: `msg_${msgIndex}`,
                        role: currentRole,
                        content: text.length > 6000 ? text.slice(0, 6000) + '\n[... truncated]' : text,
                        index: msgIndex,
                        kind: 'standard',
                    });
                    msgIndex++;
                }
            }
            // Start new user message
            currentRole = 'user';
            currentContent = [userMatch[1]];
            continue;
        }

        if (!started) continue;

        // After user message, switch to assistant when we see content
        if (currentRole === 'user' && trimmed && !userMatch) {
            // Flush user message
            const text = currentContent.join('\n').trim();
            if (text.length > 1) {
                messages.push({
                    id: `msg_${msgIndex}`,
                    role: 'user',
                    content: text,
                    index: msgIndex,
                    kind: 'standard',
                });
                msgIndex++;
            }
            currentRole = 'assistant';
            currentContent = [];
        }

        // Skip noise lines
        if (!trimmed) continue;
        if (/^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed)) continue;  // Box drawing
        if (/^Type your message/i.test(trimmed)) continue;        // Prompt text
        if (/^for\s*shortcuts/i.test(trimmed)) continue;          // Help text
        if (/^\? for help/i.test(trimmed)) continue;              // Help text
        if (/^Press enter/i.test(trimmed)) continue;              // Dialog
        if (/^[\u2800-\u28ff]+$/.test(trimmed)) continue;         // Spinner only

        if (currentRole) {
            currentContent.push(trimmed);
        }
    }

    // Flush final
    if (currentRole && currentContent.length > 0) {
        const text = currentContent.join('\n').trim();
        if (text.length > 1) {
            messages.push({
                id: `msg_${msgIndex}`,
                role: currentRole,
                content: text.length > 6000 ? text.slice(0, 6000) + '\n[... truncated]' : text,
                index: msgIndex,
                kind: 'standard',
            });
        }
    }

    // Keep last 50 messages
    return messages.length > 50 ? messages.slice(-50) : messages;
}

module.exports = function parseOutput(input) {
    const { buffer, recentBuffer, partialResponse } = input;

    // Status
    const tail = (recentBuffer || (buffer || '').slice(-500));
    const status = detectStatus({ tail });

    // Modal
    const activeModal = status === 'waiting_approval'
        ? parseApproval({ buffer, tail })
        : null;

    // Messages
    const messages = splitTurns(buffer);

    // Append partial response as in-progress assistant message if generating
    if (status === 'generating' && partialResponse && partialResponse.trim().length > 2) {
        const partial = partialResponse.trim();
        messages.push({
            id: `msg_partial`,
            role: 'assistant',
            content: partial.length > 6000 ? partial.slice(0, 6000) + '\n[... streaming]' : partial,
            index: messages.length,
            kind: 'standard',
            meta: { streaming: true },
        });
    }

    return {
        id: 'cli_session',
        status,
        title: 'Claude Code',
        messages,
        activeModal,
    };
};
