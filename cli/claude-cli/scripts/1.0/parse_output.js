/**
 * Claude Code — parse_output
 *
 * Screen structure:
 *   [❯›>] <text>   — user prompt line (may wrap onto indented continuation lines)
 *   ⏺ Foo(...)     — tool call header
 *   ⏺ <text>       — assistant prose opener
 *   ⎿ <text>       — tool output continuation (skip)
 *   footer zone    — spinner / shell chrome / completion footer (skip)
 *
 * Classifier delegation: all line-role detection (spinner, shell chrome, tool)
 * is done by detect_status.js structural classifiers. This file never
 * pattern-matches on spinner verb strings, model names, or tool name lists.
 */

'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const {
    buildScreenSnapshot,
    getScreen,
    normalizeLineText,
    trimBottom,
} = require('./screen_helpers.js');

// ─── Structural classifiers (role-based, not string-based) ────────────────────

const { isSpinnerLine, isShellChrome } = (() => {
    const ds = require('./detect_status.js');
    if (typeof ds._isSpinnerLine === 'function') {
        return { isSpinnerLine: ds._isSpinnerLine, isShellChrome: ds._isShellChrome };
    }
    // Fallback: conservative structural predicates — no spinner verb strings.
    function _hasGlyphPrefix(t) { return /^[⏺✻✶✳✢✽·•]\s+/.test(t); }
    function _isShellChrome(t) {
        return /^➜\s+\S+/.test(t)
            || /^⏵⏵\s+accept edits on/i.test(t)
            || /^ctrl\+g to edit in VS Code/i.test(t)
            || /^Update available!/i.test(t)
            || /Claude Code v\d/i.test(t)
            || /^(Sonnet|Opus|Haiku)\b/i.test(t);
    }
    function _hasMetricBlock(metricBlock) {
        return /(?:\btokens?\b|thought for|[↑↓]|\b\d+(?:\.\d+)?(?:ms|s|m|h)\b)/iu.test(metricBlock);
    }
    function _isSpinnerMetric(t) {
        // Standard: "text… (metric block)"
        if (/[.…]\s*\(/u.test(t)) {
            const m = t.match(/\(([^)]*)\)\s*$/u)?.[1] || '';
            if (_hasMetricBlock(m)) return true;
        }
        // Chopped metric suffix: very short non-punctuated prefix + " (metric block)"
        // e.g. "emp ( · ↓ 1 tokens)" is a chopped "Contemplating… ( · ↓ 1 tokens)"
        const suffixMatch = t.match(/^([\p{L}\p{M}\s·…]{0,10})\s*\(([^)]+)\)\s*$/u);
        if (suffixMatch) {
            const prefix = suffixMatch[1].trim();
            if (prefix.length <= 8 && !/[.!?,;:]/.test(prefix) && _hasMetricBlock(suffixMatch[2])) return true;
        }
        return false;
    }
    function _isSpinnerLine(t) {
        if (!t || _isShellChrome(t)) return false;
        if (_isSpinnerMetric(t)) return true;
        if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(t)) return true;
        if (/^[⠂⠐⠒⠓⠦⠴⠶⠷⠿](?:\s+|$)/.test(t)) return true;
        if (/esc to (cancel|interrupt|stop)/i.test(t)) return true;
        // Bare word ending with horizontal ellipsis — spinner without glyph prefix
        // (e.g. single-word TUI animation frames like "g…" partial renders)
        if (/^[\p{L}\p{M}''\-]{1,30}…$/u.test(t)) return true;
        if (!_hasGlyphPrefix(t)) return false;
        const body = t.replace(/^[⏺✻✶✳✢✽·•]\s+/, '').trim();
        if (!body || body.length > 96) return false;
        return /(?:…|\.\.\.)(?:\s*\([^)]*\))?\s*$/u.test(body)
            && !/^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(body);
    }
    return { isSpinnerLine: _isSpinnerLine, isShellChrome: _isShellChrome };
})();

// ─── Line primitives ──────────────────────────────────────────────────────────

function splitLines(text) {
    return buildScreenSnapshot(text).lines.map(l => l.text);
}

function sanitize(line) {
    // Strip BEL and OSC numeric prefix residue
    return String(line || '').replace(/\u0007/g, '').replace(/^\s*\d+;/, '');
}

function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ─── Prompt line parsing ──────────────────────────────────────────────────────

function parsePromptLine(line) {
    const t = sanitize(line).trim();
    const m = t.match(/^[❯›>]\s*(.*)$/);
    if (!m) return null;
    let body = m[1].trim();
    // Numbered list items and bare numbers are not prompt lines
    if (/^\d+[.)]\s+/.test(body) || /^\d+$/.test(body)) return null;
    body = body.replace(/^\d+(?=[A-Z])/u, '');
    return body;
}

function isPromptContinuation(line) {
    const s = sanitize(line);
    const t = s.trim();
    if (!t) return true;
    if (/^\s*⏺\s+/.test(s)) return false;
    if (/^\s*⎿\s+/.test(s)) return false;
    if (parsePromptLine(s) !== null) return false;
    if (isFooterLine(t)) return false;
    if (isNoiseLine(t)) return false;
    if (/^[─═]{10,}$/.test(t)) return false;
    // Any leading structural glyph → not a continuation
    if (/^[⏺⎿✻✶✳✢✽·•❯›>▗▖▘▝]/.test(t)) return false;
    // Indented continuation (terminal wrap with indent)
    if (/^\s+\S/.test(s)) return true;
    // List item continuations
    if (/^\d+[.)]\s+/.test(t) || /^[-*+]\s+/.test(t)) return true;
    // Very short pure-letter tokens are animation frame fragments, not real prompt wraps
    if (/^[a-zA-Z]{1,4}$/.test(t)) return false;
    // Plain text with no structural prefix — PTY hard-wrap of prompt at terminal width
    return true;
}

function collectPromptText(lines, start) {
    const first = parsePromptLine(lines[start]);
    if (!first) return { text: '', endIndex: start };
    const parts = [first];
    let end = start;
    for (let i = start + 1; i < lines.length; i++) {
        if (!isPromptContinuation(lines[i])) break;
        end = i;
        const cont = sanitize(lines[i]).replace(/\s+$/, '');
        if (cont.trim()) parts.push(cont);
    }
    return { text: parts.join('\n').trim(), endIndex: end };
}

// ─── Footer / noise classification ───────────────────────────────────────────

function isCompletionFooterLine(t) {
    // Structure: [optional glyph] <1-3 words> "for" <duration(s)>
    // Deliberately no verb list — works for any rotating verb Claude uses.
    return /^(?:[✻✶✳✢✽]\s*)?[\p{L}\p{M}][\p{L}\p{M}''\-]{1,40}(?:\s+[\p{L}\p{M}][\p{L}\p{M}''\-]{1,40}){0,2}\s+for\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h)(?:\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h))*$/iu.test(t);
}

function isFooterLine(t) {
    if (isShellChrome(t)) return true;
    if (isCompletionFooterLine(t)) return true;
    // Horizontal separator lines (─ ═ —)
    if (/^[─═\-]{10,}$/.test(t)) return true;
    // Survey UI: "N: Bad/Poor/... 0: Dismiss"
    if (/^\d+:\s*(?:Bad|Poor|Okay|Fine|Good)\b.*\b0:\s*Dismiss\b/i.test(t)) return true;
    // Bare numeric menu echo
    if (/^[❯›>]\s*\d+\s*$/.test(t)) return true;
    // Status-bar path block
    if (/^[▗▖▘▝\s]+~\//.test(t)) return true;
    return false;
}

function isNoiseLine(t) {
    if (!t) return false;
    if (isSpinnerLine(t)) return true;
    if (isFooterLine(t)) return true;
    // OSC title-set residue: "N; ..."
    if (/^\d+;\s*\S/.test(t)) return true;
    // Truncation marker / background hint / bare glyph
    if (/^…\s+\+\d+\s+lines\b/i.test(t)) return true;
    if (/^\+\d+\s+more\s+tool\s+uses?\b/i.test(t)) return true;
    if (/\bctrl\+b\s+to\s+run\s+in\s+background\b/i.test(t)) return true;
    if (/^[·•✻✶✳✢✽…]$/.test(t)) return true;
    // Truncated completion footer: "✻ Verb for" or "[glyph] Verb for" without duration yet
    // (screen captured mid-render before duration appended)
    if (/^(?:[✻✶✳✢✽]\s+)?[\p{L}][\p{L}\-]{1,30}(?:\s+[\p{L}][\p{L}\-]{1,30}){0,2}\s+for\s*$/iu.test(t)) return true;
    // Empty-session startup chrome (structural: appears before any turn)
    if (/^Type your message/i.test(t)) return true;
    if (/^\? for help/i.test(t)) return true;
    if (/^Press enter/i.test(t)) return true;
    return false;
}

// ─── Tool call detection ──────────────────────────────────────────────────────
//
// A tool call line has the form:  ⏺ Name(...)
// We do NOT enumerate tool names — any identifier followed by "(" qualifies.
// This means new tools Claude Code adds require zero code changes here.

function parseToolCall(text) {
    // Returns { name, args } or null
    const m = String(text || '').trim().match(/^([A-Za-z][A-Za-z0-9_]*)\((.*)$/s);
    if (!m) return null;
    const name = m[1];
    // Exclude leading words that are clearly prose (short common English words)
    // by requiring the name to look like a PascalCase or ALLCAPS identifier,
    // OR be followed immediately by "(" with no space before it.
    // This rejects things like "Reading 3 files" which start with a word.
    if (!/^[A-Z]/.test(name)) return null;
    return { name, args: m[2] };
}

function parseBashArgs(argsStr) {
    // Extract the command from Bash(...) — may be truncated (no closing paren)
    const closed = String(argsStr || '').match(/^(.*)\)$/s);
    const raw = closed ? closed[1] : argsStr;
    return String(raw || '').trim() || null;
}

// ─── Approval line detection ──────────────────────────────────────────────────

function isApprovalLine(t) {
    return /This command requires approval/i.test(t)
        || /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(t)
        || /Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(t);
}

// ─── Prompt identity helpers ──────────────────────────────────────────────────

function normPrompt(text) {
    return norm(String(text || '').replace(/\n[ \t]+/g, ''));
}

function looksLikeSamePrompt(a, b) {
    const na = normPrompt(a), nb = normPrompt(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    if (Math.min(na.length, nb.length) < 24) return false;
    return na.startsWith(nb) || nb.startsWith(na);
}

function isPromptFragment(fragment, promptText) {
    const nf = normPrompt(fragment), np = normPrompt(promptText);
    if (!nf || !np || nf.length < 8) return false;
    return nf === np || np.startsWith(nf) || np.endsWith(nf);
}

function looksLikePromptEcho(candidate, promptText, previousMessages) {
    const nc = norm(candidate);
    if (!nc) return false;
    const check = (prompt) => {
        const np = norm(prompt);
        if (!np) return false;
        if (nc.length < 24 && nc.length < Math.ceil(np.length * 0.6)) return false;
        return looksLikeSamePrompt(nc, np);
    };
    if (promptText && check(promptText)) return true;
    const lastUser = [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse().find(m => m?.role === 'user' && typeof m.content === 'string');
    return !!lastUser && check(lastUser.content);
}

function getLastUserPrompt(previousMessages) {
    return [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse().find(m => m?.role === 'user' && typeof m.content === 'string')?.content || '';
}

function resolvePromptText(inputPrompt, visiblePrompt, previousMessages) {
    const explicit = String(inputPrompt || '').trim();
    if (explicit) return explicit;
    const visible = String(visiblePrompt || '').trim();
    const previous = String(getLastUserPrompt(previousMessages) || '').trim();
    if (visible && previous && looksLikeSamePrompt(visible, previous)) {
        return previous.length >= visible.length ? previous : visible;
    }
    return visible || previous;
}

// ─── Strip leading prompt echo from assistant text ────────────────────────────

function trimPromptEcho(text, promptText) {
    const lines = splitLines(text).map(l => l.trim());
    const np = normPrompt(promptText);
    if (!np || !lines.length) return text;
    let drop = 0;
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
        const frag = lines[i].replace(/^[.…]+\s*/, '').trim();
        if (!frag) { if (drop === i) drop = i + 1; continue; }
        if (!normPrompt(frag)) break;
        if (isPromptFragment(frag, promptText)) { drop = i + 1; continue; }
        break;
    }
    return lines.slice(drop).join('\n').trim();
}

function stripLeadingFragments(text, promptText) {
    const lines = splitLines(text).map(l => l.trim());
    const np = normPrompt(promptText);
    if (!np || !lines.length) return String(text || '').trim();
    let i = 0;
    while (i < lines.length - 1 && isPromptFragment(lines[i], promptText)) i++;
    return lines.slice(i).join('\n').trim();
}

// ─── Region extraction ────────────────────────────────────────────────────────

function findPromptTurns(lines) {
    const turns = [];
    for (let i = 0; i < lines.length; i++) {
        const p = parsePromptLine(lines[i]);
        if (!p) continue;
        const col = collectPromptText(lines, i);
        if (!col.text) continue;
        turns.push({ index: i, text: col.text, endIndex: col.endIndex });
        i = Math.max(i, col.endIndex);
    }
    return turns;
}

function trimRegionBoundaries(lines) {
    let s = 0, e = Array.isArray(lines) ? lines.length : 0;
    while (s < e && !sanitize(lines[s]).trim()) s++;
    while (e > s) {
        const t = sanitize(lines[e - 1]).trim();
        if (!t || isFooterLine(t)) { e--; continue; }
        break;
    }
    return lines.slice(s, e);
}

function getVisibleAssistantRegion(screen) {
    const lines = screen.lines.map(l => l.text);
    // Find empty prompt (current input box at bottom)
    let emptyPromptIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
        if (parsePromptLine(lines[i]) === '') { emptyPromptIdx = i; break; }
    }
    // Find last non-empty prompt
    const searchEnd = emptyPromptIdx >= 0 ? emptyPromptIdx - 1 : lines.length - 1;
    let lastPrompt = { index: -1, text: '', endIndex: -1 };
    for (let i = searchEnd; i >= 0; i--) {
        const p = parsePromptLine(lines[i]);
        if (p) { const col = collectPromptText(lines, i); lastPrompt = { index: i, ...col }; break; }
    }
    const start = lastPrompt.endIndex >= 0 ? lastPrompt.endIndex + 1 : 0;
    const end = emptyPromptIdx >= 0 ? emptyPromptIdx : lines.length;
    return trimBottom(lines.slice(start, end), 0);
}

function getTranscriptAssistantRegion(text, promptText) {
    const lines = splitLines(String(text || ''));
    if (!lines.length) return [];
    let promptInfo = null;
    for (let i = lines.length - 1; i >= 0; i--) {
        const p = parsePromptLine(lines[i]);
        if (!p) continue;
        const col = collectPromptText(lines, i);
        if (!promptText || looksLikeSamePrompt(col.text, promptText)) {
            promptInfo = { index: i, ...col }; break;
        }
    }
    if (!promptInfo) return [];
    const turns = findPromptTurns(lines);
    const next = turns.find(t => t.index > promptInfo.index);
    return trimRegionBoundaries(lines.slice(promptInfo.endIndex + 1, next ? next.index : lines.length));
}

// ─── Box-drawing table normalization ─────────────────────────────────────────

function normalizeBoxTable(lines) {
    // Convert box-drawing table rows (│ col │) to markdown (| col |).
    // Rows: ┌/├/└ separator rows → skip (we emit our own --- separator).
    // Returns the normalized lines replacing the block.
    const boxRow = /^[\s│]*(│[^┌┐└┘├┤┬┴┼]+)+│\s*$/;
    const boxSep = /^[\s┌┐└┘├┤┬┴┼─]+$/;

    const out = [];
    let i = 0;
    while (i < lines.length) {
        const t = lines[i].trim();
        if (boxSep.test(t) && /[┌┐└┘├┤┬┴┼]/.test(t)) {
            // start of a box table block — skip separator, collect data rows
            i++;
            const tableRows = [];
            while (i < lines.length) {
                const rt = lines[i].trim();
                if (boxSep.test(rt) && /[┌┐└┘├┤┬┴┼]/.test(rt)) { i++; continue; }
                if (!boxRow.test(lines[i])) break;
                const cols = rt.replace(/^│/, '').replace(/│$/, '').split('│').map(c => c.trim());
                tableRows.push(cols);
                i++;
            }
            if (tableRows.length > 0) {
                const header = tableRows[0];
                out.push('| ' + header.join(' | ') + ' |');
                out.push('| ' + header.map(() => '---').join(' | ') + ' |');
                for (const row of tableRows.slice(1)) {
                    out.push('| ' + row.join(' | ') + ' |');
                }
            }
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    return out;
}

function normalizePythonFences(lines) {
    // Detect unfenced Python code blocks and wrap them in ```python fences.
    // A Python block starts with an import statement or common Python keywords
    // preceded by no fence marker, and ends where non-Python prose resumes.
    const pythonStart = /^(?:import\s+\w|from\s+\w+\s+import|def\s+\w|class\s+\w|#!.*python)/;
    const pythonLine = /^(?:import\s|from\s|def\s|class\s|return\s|if\s|for\s|while\s|with\s|try:|except|print\(|[a-zA-Z_]\w*\s*=|#[^!]|""")/;
    const inFence = (line) => /^```/.test(line.trim());

    const out = [];
    let i = 0;
    let inFenceBlock = false;
    while (i < lines.length) {
        const t = lines[i].trim();
        if (inFence(lines[i])) { inFenceBlock = !inFenceBlock; out.push(lines[i]); i++; continue; }
        if (!inFenceBlock && pythonStart.test(t)) {
            // Collect the block
            const block = [];
            while (i < lines.length && !inFence(lines[i])) {
                const bt = lines[i].trim();
                if (!bt) { block.push(''); i++; continue; }
                if (pythonLine.test(bt)) { block.push(lines[i]); i++; continue; }
                break;
            }
            // Trim trailing empty lines
            while (block.length > 0 && !block[block.length - 1].trim()) block.pop();
            if (block.length > 0) {
                out.push('```python');
                out.push(...block);
                out.push('```');
            }
        } else {
            out.push(lines[i]);
            i++;
        }
    }
    return out;
}

function normalizeAssistantText(text) {
    let lines = String(text || '').split('\n');
    lines = normalizeBoxTable(lines);
    lines = normalizePythonFences(lines);
    return lines.join('\n');
}

// ─── Message builders ─────────────────────────────────────────────────────────

function makeAssistant(content) {
    return { role: 'assistant', kind: 'standard', content: String(content || '').trim() };
}

function makeTool(content, kind = 'tool', senderName) {
    return {
        role: 'assistant',
        kind,
        senderName: senderName || (kind === 'terminal' ? 'Terminal' : 'Tool'),
        content: String(content || '').trim(),
    };
}

function makeApproval(activeModal) {
    const message = String(activeModal?.message || '').trim();
    const buttons = Array.isArray(activeModal?.buttons)
        ? activeModal.buttons.map(b => String(b || '').trim()).filter(Boolean)
        : [];
    const lines = ['Approval requested'];
    if (message) lines.push(message);
    if (buttons.length) lines.push(buttons.map(l => `[${l}]`).join(' '));
    return { role: 'assistant', kind: 'system', senderName: 'System', content: lines.join('\n') };
}

// ─── Core region parser ───────────────────────────────────────────────────────
//
// Iterates lines in the assistant region and emits message objects.
// Line roles:
//   prompt line     → stop (shouldn't appear in region, but guard)
//   footer/noise    → stop or skip
//   ⏺ Name(...)    → tool call
//   ⏺ <text>       → assistant prose (or spinner → skip)
//   ⎿ <text>       → tool output (append to active terminal or skip)
//   anything else  → assistant prose (if not skipping tool block)

function parseRegion(lines, promptText) {
    const messages = [];
    let currentAssistant = [];
    let skippingTool = false;
    let activeTerminalIdx = -1;

    function flushAssistant() {
        // Drop batches that are entirely animation frame fragments (e.g. "El", "E e", "f c")
        // Artifacts: ≤5 chars, only letters/spaces/ellipsis, no uppercase initial (real words start uppercase)
        const isArtifact = (t) => t.length <= 5 && /^[a-zA-Z ·…]+$/.test(t) && !/^[A-Z]{2,}/.test(t);
        if (currentAssistant.length > 0 && currentAssistant.every(l => isArtifact(l.trim()))) {
            currentAssistant = [];
            return;
        }
        // Strip leading animation artifacts before real content
        while (currentAssistant.length > 1 && isArtifact(currentAssistant[0].trim())) {
            currentAssistant.shift();
        }
        const text = currentAssistant
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
        currentAssistant = [];
        if (!text) return;
        // Drop if it's entirely a prompt echo
        if (isPromptFragment(text, promptText) && text.length < (normPrompt(promptText).length + 10)) return;
        messages.push(makeAssistant(normalizeAssistantText(text)));
    }

    function appendTerminal(line) {
        if (activeTerminalIdx < 0) return false;
        const t = String(line || '').trim();
        if (!t) return true;
        // Skip transient state lines inside terminal output
        if (/^(?:Running|Queued|Waiting)(?:…|\.\.\.)?$/i.test(t)) return true;
        // Skip TUI hard-wrap path suffix fragments: mid-word lowercase start + ) pattern
        if (/^[a-z]\)/.test(t)) return true;
        const msg = messages[activeTerminalIdx];
        if (!msg || msg.kind !== 'terminal') return false;
        msg.content = `${String(msg.content || '').replace(/\s+$/, '')}\n${t}`;
        return true;
    }

    for (const rawLine of lines) {
        if (parsePromptLine(rawLine) !== null) continue;

        const s = sanitize(rawLine);
        const t = s.trim();

        // Horizontal separators are UI chrome — always skip, never break
        if (/^[─═\-]{10,}$/.test(t)) continue;
        if (isFooterLine(t)) break;
        if (isNoiseLine(t) && !/^\s*⏺\s+/.test(s)) continue;

        // ── ⏺ lines ──────────────────────────────────────────────────────────
        if (/^\s*⏺\s+/.test(s)) {
            const body = s.replace(/^\s*⏺\s+/, '').trim();

            // Tool activity progress lines (e.g. "Reading 1 file… (ctrl+o to expand)")
            // must be checked before spinner so they are not swallowed as chrome.
            const isToolActivity = /^(?:Reading|Searching|Updating|Editing|Writing)\b/i.test(body);

            // Spinner metric / ellipsis — pure chrome (but not tool activity)
            if (!isToolActivity && isSpinnerLine(s)) {
                flushAssistant();
                skippingTool = false;
                activeTerminalIdx = -1;
                continue;
            }

            // Approval line — not assistant prose
            if (isApprovalLine(body)) {
                flushAssistant();
                skippingTool = false;
                activeTerminalIdx = -1;
                continue;
            }

            const tool = parseToolCall(body);

            if (tool) {
                flushAssistant();
                activeTerminalIdx = -1;
                skippingTool = true;

                if (tool.name === 'Bash') {
                    const cmd = parseBashArgs(tool.args);
                    if (cmd) {
                        messages.push(makeTool(`$ ${cmd}`, 'terminal', 'Terminal'));
                        activeTerminalIdx = messages.length - 1;
                    }
                } else {
                    // All other tools: show "Name(args)" as a tool message
                    messages.push(makeTool(body, 'tool', 'Tool'));
                }
                continue;
            }

            // Tool activity progress line (e.g. "Reading 1 file… (ctrl+o to expand)")
            if (isToolActivity) {
                flushAssistant();
                skippingTool = false;
                activeTerminalIdx = -1;
                messages.push(makeTool(body, 'tool', 'Tool'));
                continue;
            }

            // ⏺ non-tool, non-spinner → assistant prose
            flushAssistant();
            skippingTool = false;
            activeTerminalIdx = -1;
            if (body) currentAssistant.push(body);
            continue;
        }

        // ── ⎿ lines (tool output continuation) ───────────────────────────────
        if (/^\s*⎿\s+/.test(s)) {
            const body = s.replace(/^\s*⎿\s+/, '').trim();
            appendTerminal(body);
            continue;
        }

        // ── Everything else ───────────────────────────────────────────────────
        if (skippingTool) {
            appendTerminal(t);
            continue;
        }

        const cleaned = s.replace(/^\s*[✻✶✳✢✽]\s+/, '').trimEnd();
        const tc = cleaned.trim();
        if (!tc) {
            if (currentAssistant.length && currentAssistant[currentAssistant.length - 1] !== '') {
                currentAssistant.push('');
            }
            continue;
        }
        if (isNoiseLine(tc)) continue;
        currentAssistant.push(tc);
    }

    flushAssistant();
    return messages;
}

// ─── Full transcript multi-turn parser ────────────────────────────────────────

function buildFullTranscript(text) {
    const lines = splitLines(String(text || ''));
    const turns = findPromptTurns(lines);
    if (turns.length < 2) return [];
    const messages = [];
    for (let i = 0; i < turns.length; i++) {
        const turn = turns[i];
        const next = turns[i + 1];
        const region = trimRegionBoundaries(lines.slice(turn.endIndex + 1, next ? next.index : lines.length));
        const parsed = parseRegion(region, turn.text)
            .filter(m => m && typeof m.content === 'string' && m.content.trim());
        if (!parsed.some(m => m.role === 'assistant')) continue;
        messages.push({ role: 'user', content: turn.text });
        messages.push(...parsed);
    }
    return messages;
}

// ─── shouldPreferTranscript ───────────────────────────────────────────────────

function shouldPreferTranscript(visible, transcript) {
    if (!Array.isArray(transcript) || !transcript.length) return false;
    if (!Array.isArray(visible) || !visible.length) return true;
    const stdAssistant = (msgs) => msgs.filter(m => m?.role === 'assistant' && (m?.kind || 'standard') === 'standard');
    const va = stdAssistant(visible), ta = stdAssistant(transcript);
    const vLast = String(va[va.length - 1]?.content || '').trim();
    const tLast = String(ta[ta.length - 1]?.content || '').trim();
    // If transcript last message contains spinner/chrome residue and visible doesn't, prefer visible
    const polluted = (t) => splitLines(t).some(l => isSpinnerLine(l.trim())) || /(?:^|\n)[✻✶✳✢✽]/u.test(t);
    if (tLast && polluted(tLast) && vLast && !polluted(vLast)) return false;
    if (transcript.length > visible.length) return true;
    const vLen = va.reduce((s, m) => s + String(m?.content || '').length, 0);
    const tLen = ta.reduce((s, m) => s + String(m?.content || '').length, 0);
    return tLen > vLen;
}

// ─── Message assembly ─────────────────────────────────────────────────────────

function assembleMessages(previousMessages, promptText, visibleMessages) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
            .map(m => ({
                role: m.role,
                content: typeof m.content === 'string' ? m.content : String(m.content || ''),
                kind: typeof m.kind === 'string' && m.kind ? m.kind : 'standard',
                senderName: typeof m.senderName === 'string' && m.senderName ? m.senderName : undefined,
                timestamp: m.timestamp,
                meta: m.meta && typeof m.meta === 'object' ? { ...m.meta } : undefined,
            }))
        : [];

    let sameTurn = false;
    if (promptText) {
        const prevUser = [...base].reverse().find(m => m?.role === 'user' && typeof m.content === 'string');
        if (!prevUser || !looksLikeSamePrompt(prevUser.content, promptText)) {
            base.push({ role: 'user', content: promptText });
        } else {
            sameTurn = true;
        }
    }

    if (sameTurn) {
        while (base.length && base[base.length - 1]?.role === 'assistant') base.pop();
    }

    const effective = Array.isArray(visibleMessages)
        ? visibleMessages
            .map(m => {
                const raw = String(m?.content || '').trim();
                const cleaned = m?.kind === 'standard'
                    ? trimPromptEcho(stripLeadingFragments(raw, promptText), promptText)
                    : raw;
                return { ...m, content: cleaned || (!looksLikePromptEcho(raw, promptText, previousMessages) ? raw : '') };
            })
            .filter(m => m && typeof m.content === 'string' && m.content.trim())
        : [];

    if (!effective.length) return base;
    if (
        effective.length === 1
        && effective[0]?.role === 'assistant'
        && (effective[0]?.kind || 'standard') === 'standard'
        && looksLikePromptEcho(effective[0].content, promptText, previousMessages)
    ) return base;

    const last = base[base.length - 1];
    if (
        !sameTurn
        && effective.length === 1
        && last?.role === 'assistant'
        && (last?.kind || 'standard') === 'standard'
        && (effective[0]?.kind || 'standard') === 'standard'
    ) {
        if (norm(last.content) !== norm(effective[0].content)) {
            last.content = effective[0].content;
        }
        return base;
    }

    for (const m of effective) {
        if (m.role === 'assistant' && (m.kind || 'standard') !== 'standard') {
            base.push({ role: 'assistant', kind: m.kind, senderName: m.senderName, content: m.content });
            continue;
        }
        base.push({
            role: 'assistant',
            kind: 'standard',
            content: String(m.content || '').trim(),
            ...(typeof m.senderName === 'string' && m.senderName ? { senderName: m.senderName } : {}),
            ...(m.meta ? { meta: { ...m.meta } } : {}),
        });
    }

    return base;
}

// ─── Control value extraction (model / effort from footer) ───────────────────

function extractControlValues(screenText) {
    const values = {};
    const lines = splitLines(screenText)
        .map(l => sanitize(l).trim())
        .filter(Boolean)
        .slice(-15);

    const explicitDefault = lines.some(t =>
        /^(?:[⎿└╰│>\-\s]+)?Set model to\s+(?:Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\s+\(default\)$/i.test(t));
    if (explicitDefault) values.model = 'default';

    for (let i = lines.length - 1; i >= 0; i--) {
        const t = lines[i];
        const setModel = t.match(/^(?:[⎿└╰│>\-\s]+)?Set model to\s+(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?$/i);
        if (setModel && values.model !== 'default') values.model = setModel[1].toLowerCase();
        const footerModel = t.match(/^(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\b/i);
        if (footerModel && values.model !== 'default' && values.model === undefined) values.model = footerModel[1].toLowerCase();
        const effort = t.match(/\b(low|medium|high|max)\s+[·•]\s+\/effort\b/i);
        if (effort && values.effort === undefined) values.effort = effort[1].toLowerCase();
    }

    return Object.keys(values).length ? values : undefined;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

module.exports = function parseOutput(input) {
    const screen = getScreen(input);
    const screenText = String(screen.text || input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || (screenText || buffer).slice(-500));
    const transcriptSource = buffer || screenText || String(input?.rawBuffer || '');
    const visibleScreen = buildScreenSnapshot(screenText || transcriptSource);
    const previousMessages = Array.isArray(input?.messages) ? input.messages : [];

    const status = detectStatus({
        tail,
        screenText,
        screen: visibleScreen,
        tailScreen: buildScreenSnapshot(tail),
        rawBuffer: input?.rawBuffer || '',
    });

    const activeModal = status === 'waiting_approval'
        ? parseApproval({
            buffer: screenText || buffer,
            screenText,
            screen: visibleScreen,
            bufferScreen: visibleScreen,
            rawBuffer: input?.rawBuffer || '',
            tail,
        })
        : null;

    const effectiveStatus = status === 'waiting_approval' && !activeModal
        ? (/^\s*[❯›>]\s*$/m.test(screenText) ? 'idle' : 'generating')
        : status;

    // ── Prompt resolution ────────────────────────────────────────────────────
    let promptText = '';
    if (effectiveStatus !== 'waiting_approval') {
        const visibleRegionLines = getVisibleAssistantRegion(visibleScreen);
        // Recover visible prompt from screen
        const visibleLines = visibleScreen.lines.map(l => l.text);
        const emptyIdx = (() => {
            for (let i = visibleLines.length - 1; i >= 0; i--)
                if (parsePromptLine(visibleLines[i]) === '') return i;
            return -1;
        })();
        const searchEnd = emptyIdx >= 0 ? emptyIdx - 1 : visibleLines.length - 1;
        let visiblePrompt = '';
        for (let i = searchEnd; i >= 0; i--) {
            const p = parsePromptLine(visibleLines[i]);
            if (p) {
                // If this prompt is a structural input box (preceded by separator),
                // the user is still typing — skip and look for the last submitted prompt.
                const prevLine = i > 0 ? sanitize(visibleLines[i - 1]).trim() : '';
                if (/^[─═\-]{10,}$/.test(prevLine)) continue;
                visiblePrompt = collectPromptText(visibleLines, i).text || p;
                break;
            }
        }
        promptText = resolvePromptText(input?.promptText, visiblePrompt, previousMessages);

        // Fallback: extract from transcript when session scope cleared
        if (!promptText && effectiveStatus === 'idle' && transcriptSource.length > 200) {
            const tLines = splitLines(transcriptSource);
            for (let i = tLines.length - 1; i >= 0; i--) {
                const p = parsePromptLine(tLines[i]);
                if (p) { promptText = collectPromptText(tLines, i).text || p; break; }
            }
        }
    }

    const hasAnchor = !!promptText
        || previousMessages.some(m => m?.role === 'assistant')
        || (effectiveStatus === 'idle' && transcriptSource.length > 200);

    // ── Message extraction ───────────────────────────────────────────────────
    let visibleMessages;
    if (effectiveStatus === 'waiting_approval') {
        visibleMessages = activeModal ? [makeApproval(activeModal)] : [];
    } else if (hasAnchor) {
        const visibleRegion = getVisibleAssistantRegion(visibleScreen);
        visibleMessages = parseRegion(visibleRegion, promptText);
        const transcriptRegion = getTranscriptAssistantRegion(transcriptSource, promptText);
        const transcriptMessages = parseRegion(transcriptRegion, promptText);
        if (shouldPreferTranscript(visibleMessages, transcriptMessages)) {
            visibleMessages = transcriptMessages;
        }
    } else {
        visibleMessages = [];
    }

    // ── Full transcript fallback (no previous messages / prompt) ─────────────
    const fullTranscript = effectiveStatus !== 'waiting_approval'
        && !input?.promptText
        && !previousMessages.length
        ? buildFullTranscript(transcriptSource)
        : [];

    const controlValues = extractControlValues(screenText || buffer);

    const builtMessages = (fullTranscript.length > visibleMessages.length
        ? fullTranscript
        : assembleMessages(previousMessages, promptText, visibleMessages))
        .filter(m => !(m?.role === 'assistant' && (!m.content || !String(m.content).trim())));

    return {
        id: 'cli_session',
        status: effectiveStatus,
        title: 'Claude Code',
        messages: builtMessages.map((m, i, arr) => ({
            id: `msg_${i}`,
            role: m.role,
            content: m.content,
            index: i,
            kind: typeof m.kind === 'string' && m.kind ? m.kind : 'standard',
            ...(typeof m.senderName === 'string' && m.senderName ? { senderName: m.senderName } : {}),
            ...(m.meta ? { meta: { ...m.meta } } : {}),
            ...(effectiveStatus === 'generating' && i === arr.length - 1 && m.role === 'assistant'
                ? { meta: { ...(m.meta || {}), streaming: true } }
                : {}),
        })),
        activeModal,
        ...(controlValues ? { controlValues } : {}),
    };
};
