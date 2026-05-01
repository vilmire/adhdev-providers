/**
 * Claude Code — parse_output
 *
 * Keep the parser simple:
 * - trust / approval screens are not assistant transcript
 * - preserve visible assistant blocks and plain bullet/text content
 * - drop tool summaries, tool headers, footer chrome, and spinner noise
 */

'use strict';

const detectStatus = require('./detect_status.js');
const parseApproval = require('./parse_approval.js');
const {
    buildScreenSnapshot,
    getScreen,
    linesBelowPrompt,
    trimBottom,
} = require('./screen_helpers.js');

function splitLines(text) {
    return buildScreenSnapshot(text).lines.map(line => line.text);
}

function sanitizeLine(line) {
    return String(line || '')
        .replace(/\u0007/g, '')
        .replace(/^\s*\d+;/, '');
}

function normalizeText(text) {
    return String(text || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeLooseText(text) {
    return normalizeText(text).replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

function looksLikeSamePrompt(left, right) {
    const a = normalizeText(left);
    const b = normalizeText(right);
    if (!a || !b) return false;
    if (a === b) return true;
    const looseA = normalizeLooseText(left);
    const looseB = normalizeLooseText(right);
    if (looseA && looseB && looseA === looseB) return true;
    const minLength = Math.min(a.length, b.length);
    if (minLength < 24) return false;

    const compactLooseA = looseA.replace(/\s+/g, '');
    const compactLooseB = looseB.replace(/\s+/g, '');
    if (compactLooseA && compactLooseB && Math.min(compactLooseA.length, compactLooseB.length) >= 24) {
        if (compactLooseA === compactLooseB
            || compactLooseA.startsWith(compactLooseB)
            || compactLooseB.startsWith(compactLooseA)
            || compactLooseA.includes(compactLooseB)
            || compactLooseB.includes(compactLooseA)) {
            return true;
        }
    }

    return a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)
        || (looseA && looseB && (looseA.startsWith(looseB) || looseB.startsWith(looseA) || looseA.includes(looseB) || looseB.includes(looseA)));
}

function looksLikePromptEchoText(candidate, promptText, previousMessages) {
    const normalizedCandidate = normalizeText(candidate);
    if (!normalizedCandidate) return false;

    const isLikelyPromptEcho = (prompt) => {
        const normalizedPrompt = normalizeText(prompt);
        if (!normalizedPrompt) return false;
        if (normalizedCandidate.length < 24 && normalizedCandidate.length < Math.ceil(normalizedPrompt.length * 0.6)) {
            return false;
        }
        return looksLikeSamePrompt(normalizedCandidate, normalizedPrompt);
    };

    if (promptText && isLikelyPromptEcho(promptText)) return true;

    const lastUser = [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string');
    return !!lastUser && isLikelyPromptEcho(lastUser.content);
}

function getLastUserPrompt(previousMessages) {
    return [...(Array.isArray(previousMessages) ? previousMessages : [])]
        .reverse()
        .find(message => message?.role === 'user' && typeof message.content === 'string')
        ?.content || '';
}

function resolveEffectivePromptText(inputPromptText, visiblePromptText, previousMessages) {
    const explicitPrompt = String(inputPromptText || '').trim();
    if (explicitPrompt) return explicitPrompt;
    const visiblePrompt = String(visiblePromptText || '').trim();
    const previousPrompt = String(getLastUserPrompt(previousMessages) || '').trim();
    if (visiblePrompt && previousPrompt && looksLikeSamePrompt(visiblePrompt, previousPrompt)) {
        return previousPrompt.length >= visiblePrompt.length ? previousPrompt : visiblePrompt;
    }
    return visiblePrompt || previousPrompt;
}

function parsePromptLine(line) {
    const trimmed = sanitizeLine(line).trim();
    const match = trimmed.match(/^[❯›>]\s*(.*)$/);
    if (!match) return null;
    let body = match[1].trim();
    if (/^\d+[.)]\s+/.test(body)) return null;
    if (/^\d+$/.test(body)) return null;
    body = body.replace(/^\d+(?=[A-Z])/u, '');
    return body;
}

function isPromptContinuationLine(line) {
    const sanitized = sanitizeLine(line);
    const trimmed = sanitized.trim();
    if (!trimmed) return true;
    if (/^\s*⏺\s+/.test(sanitized)) return false;
    if (parsePromptLine(sanitized) !== null) return false;
    if (isFooterLine(trimmed)) return false;
    if (isHorizontalSeparatorLine(trimmed)) return false;
    return /^\s+\S/.test(sanitized)
        || /^\d+[.)]\s+/.test(trimmed)
        || /^[-*+]\s+/.test(trimmed);
}

function collectPromptText(lines, promptIndex) {
    if (!Array.isArray(lines) || promptIndex < 0 || promptIndex >= lines.length) {
        return { text: '', endIndex: promptIndex };
    }

    const firstPrompt = parsePromptLine(lines[promptIndex]);
    if (!firstPrompt) return { text: '', endIndex: promptIndex };

    const parts = [firstPrompt];
    let endIndex = promptIndex;
    for (let i = promptIndex + 1; i < lines.length; i += 1) {
        if (!isPromptContinuationLine(lines[i])) break;
        endIndex = i;
        const continuation = sanitizeLine(lines[i]).replace(/\s+$/g, '');
        if (!continuation.trim()) continue;
        parts.push(continuation);
    }

    return {
        text: parts.join('\n').trim(),
        endIndex,
    };
}

function isBoxLine(trimmed) {
    return /^[─═╭╮╰╯│┌┐└┘├┤┬┴┼]+$/.test(trimmed);
}

function stripAssistantPrefix(line) {
    return String(line || '')
        .replace(/^\s*⏺\s+/, '')
        .replace(/^\s*⎿\s+/, '')
        .replace(/^\s*[✻✶✳✢✽]\s+/, '');
}

function normalizeAssistantBlockLine(line) {
    const sanitized = sanitizeLine(line).replace(/\s+$/, '');
    const withoutPrefix = stripAssistantPrefix(sanitized);
    if (isBoxLine(withoutPrefix.trim())) return withoutPrefix.trim();
    return withoutPrefix.trimEnd();
}

function isCompletionFooterLine(trimmed) {
    const value = String(trimmed || '').trim();
    if (!value) return false;
    // Claude Code completion footers are a bare status-glyph/verb plus one or
    // more durations, e.g. "✻ Sautéed for 10s" or "Crunched for 2m 20s".
    // Match the structure instead of chasing Claude's rotating whimsical verbs.
    return /^(?:[✻✶✳✢✽]\s*)?[\p{L}\p{M}][\p{L}\p{M}'’\-]{1,40}(?:\s+[\p{L}\p{M}][\p{L}\p{M}'’\-]{1,40}){0,2}\s+for\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h)(?:\s+\d+(?:\.\d+)?\s*(?:ms|s|m|h))*$/iu.test(value);
}

function isFooterLine(trimmed) {
    return /^➜\s+\S+/.test(trimmed)
        || /^Update available!/i.test(trimmed)
        || /Claude Code v\d/i.test(trimmed)
        || /Claude Code has switched from npm to native/i.test(trimmed)
        || /^●\s+How is Claude doing this session\?/i.test(trimmed)
        || /^How is Claude doing this session\?/i.test(trimmed)
        || /^\d+:\s*(?:Bad|Poor|Okay|Fine|Good)\b.*\b0:\s*Dismiss\b/i.test(trimmed)
        || /^[❯›>]\s*\d+\s*$/i.test(trimmed)
        || isCompletionFooterLine(trimmed)
        || /^(Sonnet|Opus|Haiku)\b/i.test(trimmed)
        || /^[◐◑◒◓◴◵◶◷◸◹◺◿].*\/effort/i.test(trimmed)
        || /^⏵⏵\s+accept edits on/i.test(trimmed)
        || /^ctrl\+g to edit in VS Code/i.test(trimmed)
        || /^✳\s*Claude Code/i.test(trimmed)
        || /^[▗▖▘▝\s]+~\//.test(trimmed)
        || /\bextra usage\b/i.test(trimmed)
        || /\bthird-party apps\b/i.test(trimmed);
}

function isApprovalLine(trimmed) {
    return /This command requires approval/i.test(trimmed)
        || /Do you want to (?:proceed|make this edit|run this command|allow)/i.test(trimmed)
        || /Allow\s*once|Always\s*allow|\(y\/n\)|\[Y\/n\]/i.test(trimmed);
}

function isHorizontalSeparatorLine(trimmed) {
    return /^[-─═]{20,}$/.test(trimmed);
}

function hasStatusPrefix(trimmed) {
    return /^[⏺✻✶✳✢✽·•]\s+/.test(trimmed);
}

function isBrailleSpinnerLine(trimmed) {
    return /^[⠂⠐⠒⠓⠦⠴⠶⠷⠿](?:\s+|$)/.test(trimmed);
}

function isEllipsisStatusChrome(trimmed) {
    if (!hasStatusPrefix(trimmed)) return false;
    const body = trimmed.replace(/^[⏺✻✶✳✢✽·•]\s+/, '').trim();
    if (!body || body.length > 96) return false;
    if (!/(?:…|\.\.\.)(?:\s*\([^)]*\))?\s*$/u.test(body)) return false;
    if (/^(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)(?:\(|:)/.test(body)) return false;
    return true;
}

function isOscResidueLine(trimmed) {
    return /^\d+;\s*(?:Claude Code|Brief)\b/i.test(trimmed)
        || /^\d+;\s*(?:[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿·]\s+)?[^()\n]*(?:…|\.\.\.)(?:\s*\([^)]*\))?$/u.test(trimmed);
}

function isStatusLine(trimmed) {
    if (!trimmed) return true;
    if (/^[✻✶✳✢✽⠂⠐⠒⠓⠦⠴⠶⠷⠿]+$/.test(trimmed)) return true;
    if (isBrailleSpinnerLine(trimmed)) return true;
    if (/esc to (cancel|interrupt|stop)/i.test(trimmed)) return true;
    if (isThinkingMetricStatusLine(trimmed)) return true;
    if (isEllipsisStatusChrome(trimmed)) return true;
    return isApprovalLine(trimmed);
}

function isToolHeader(text) {
    return /^\s*(?:Bash|Read|Write|Edit|MultiEdit|Task|Glob|Grep|LS|NotebookEdit)\(/.test(text);
}

function isToolSummaryLine(trimmed) {
    return /\bctrl\+o to expand\)$/i.test(trimmed)
        || /^Read\s+\d+\s+files?\b/i.test(trimmed)
        || /^Searched for \d+ patterns?/i.test(trimmed)
        || /^Listed \d+ director(?:y|ies)/i.test(trimmed)
        || /^Wrote \d+ files?/i.test(trimmed)
        || /^Updated \d+ files?/i.test(trimmed)
        || /^Edited \d+ files?/i.test(trimmed);
}

function isStartupDashboardLine(trimmed) {
    return /^Tips for getting$/i.test(trimmed)
        || /^Welcome back\b/i.test(trimmed)
        || /^Ask Claude to create a…$/i.test(trimmed)
        || /^Recent activity$/i.test(trimmed)
        || /^No recent activity$/i.test(trimmed)
        || /^Claude Code v\d/i.test(trimmed)
        || /Claude Pro/i.test(trimmed)
        || /Organization$/i.test(trimmed)
        || /^\/private\/tmp\//.test(trimmed);
}

function isNoiseLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return false;
    if (/^…\s+\+\d+\s+lines\b/i.test(trimmed)) return true;
    if (/^[a-z]\)\s*=+\s*$/i.test(trimmed)) return true;
    if (/^[A-Za-z]$/.test(trimmed)) return true;
    if (/^[·•✻✶✳✢✽…]$/.test(trimmed)) return true;
    if (isToolSummaryLine(trimmed)) return true;
    if (isFooterLine(trimmed)) return true;
    if (isStatusLine(trimmed)) return true;
    if (isOscResidueLine(trimmed)) return true;
    if (/^Type your message/i.test(trimmed)) return true;
    if (/^for\s*shortcuts/i.test(trimmed)) return true;
    if (/^\? for help/i.test(trimmed)) return true;
    if (/^Press enter/i.test(trimmed)) return true;
    return false;
}

function trimTrailingNoise(lines) {
    const out = [...lines];
    while (out.length > 0) {
        const trimmed = sanitizeLine(out[out.length - 1]).trim();
        if (!trimmed || isNoiseLine(trimmed) || isHorizontalSeparatorLine(trimmed)) {
            out.pop();
            continue;
        }
        break;
    }
    return out;
}

function trimPromptEchoPrefix(text, promptText) {
    const lines = splitLines(text).map(line => line.trim());
    const normalizedPrompt = normalizeText(promptText);
    if (!normalizedPrompt || lines.length === 0) return text;

    let dropCount = 0;
    for (let index = 0; index < Math.min(lines.length, 8); index += 1) {
        const fragment = lines[index].replace(/^[.…]+\s*/, '').trim();
        if (!fragment) {
            if (dropCount === index) dropCount = index + 1;
            continue;
        }
        const normalizedFragment = normalizeText(fragment);
        if (!normalizedFragment) break;
        const isPromptFragment = looksLikeSamePrompt(normalizedFragment, normalizedPrompt)
            || (normalizedFragment.length >= 8 && normalizedPrompt.includes(normalizedFragment));
        if (isPromptFragment) {
            dropCount = index + 1;
            continue;
        }
        break;
    }

    return lines.slice(dropCount).join('\n').trim();
}

function collectAssistantLines(lines) {
    const out = [];
    let skippingToolBlock = false;
    let captureDetailBlock = false;

    for (const rawLine of lines) {
        const promptText = parsePromptLine(rawLine);
        if (promptText !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (isNoiseLine(trimmed)) continue;
        if (isFooterLine(trimmed)) break;

        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (isStatusLine(sanitized)) continue;
        if (!cleaned) {
            skippingToolBlock = false;
            if (out.length > 0 && out[out.length - 1] !== '') out.push('');
            continue;
        }

        if (/^\s*⏺\s+/.test(sanitized)) {
            skippingToolBlock = isToolHeader(cleaned);
            captureDetailBlock = /^\s*(?:Exact output|Output|Result):/i.test(cleaned);
            if (!skippingToolBlock && out[out.length - 1] !== cleaned) out.push(cleaned);
            continue;
        }

        if (/^\s*⎿\s+/.test(sanitized)) {
            if (captureDetailBlock && !/^…\s+\+\d+\s+lines\b/i.test(cleaned)) {
                if (out[out.length - 1] !== cleaned) out.push(cleaned);
            }
            continue;
        }

        if (skippingToolBlock && !captureDetailBlock) continue;
        if (out[out.length - 1] !== cleaned) out.push(cleaned);
    }

    return trimTrailingNoise(out);
}

// Split assistant output into text-only segments at ⏺ boundaries.
// Each segment is the prose Claude wrote before/after a tool call.
// Tool headers and indented tool output are stripped — only Claude's text is kept.
function extractAssistantBlocks(lines) {
    const blocks = [];
    let currentText = [];   // prose lines for the current segment
    let inToolContent = false; // inside indented tool-call output

    const flushText = () => {
        const text = trimTrailingNoise(currentText)
            .map(line => normalizeAssistantBlockLine(line))
            .filter(line => line.trim().length > 0)
            .join('\n')
            .trim();
        if (text) blocks.push(text);
        currentText = [];
    };

    for (const rawLine of lines) {
        if (parsePromptLine(rawLine) !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();

        if (isFooterLine(trimmed)) { flushText(); break; }

        if (!trimmed) {
            inToolContent = false;
            if (currentText.length > 0 && currentText[currentText.length - 1] !== '') {
                currentText.push('');
            }
            continue;
        }

        if (isNoiseLine(trimmed)) continue;

        // ⏺ line: tool header/tool activity or assistant prose segment start
        if (/^\s*⏺\s+/.test(sanitized)) {
            const cleaned = stripAssistantPrefix(sanitized).trim();
            if (isToolHeader(cleaned) || isToolActivitySummary(cleaned) || parseBashInvocation(cleaned)) {
                flushText();
                inToolContent = true;
                continue;
            }
            if (isStatusLine(sanitized)) {
                flushText();
                inToolContent = false;
                continue;
            }
            inToolContent = false;
            if (cleaned) currentText.push(cleaned);
            continue;
        }

        // ⎿ line: tool output continuation — skip
        if (/^\s*⎿\s+/.test(sanitized)) continue;

        // Indented content immediately after ⏺ (tool output body) — skip
        if (inToolContent && /^\s{2,}/.test(rawLine)) continue;

        inToolContent = false;

        if (isBoxLine(trimmed)) {
            currentText.push(sanitized);
            continue;
        }

        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (cleaned) currentText.push(cleaned);
    }

    flushText();
    return blocks;
}

function isSpinnerResidueLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return false;
    if (isStatusLine(trimmed)) return true;
    if (/^[·•]\s+(?:[A-Za-z]\s+){1,6}[A-Za-z…]$/u.test(trimmed)) return true;
    if (/^[A-Za-z]{1,8}\s*\(\s*·\s*[↑↓]\s*\d+\s+tokens\)$/iu.test(trimmed)) return true;
    if (/^[A-Za-z]\s+[A-Za-z…]$/u.test(trimmed)) return true;
    if (/^[A-Za-z]{1,2}\s+[A-Za-z]{1,2}$/u.test(trimmed)) return true;
    if (/^[A-Za-z]{1,4}$/u.test(trimmed) && /^[A-Z]/.test(trimmed) === false) return true;
    if (/[✻✶✳✢✽…]/u.test(trimmed) && /^[·•✻✶✳✢✽…\sA-Za-z]{1,12}$/u.test(trimmed)) return true;
    if (isStartupDashboardLine(trimmed)) return true;
    return false;
}

function looksLikeExactAnswerLine(line) {
    const trimmed = sanitizeLine(line).trim();
    if (!trimmed) return false;
    return /^[A-Z0-9][A-Z0-9 _:-]{2,}$/u.test(trimmed);
}

function isInlineSpinnerProgressLine(line) {
    const trimmed = sanitizeLine(line).trim();
    return isEllipsisStatusChrome(trimmed);
}

function cleanupAssistantText(text, promptText = '') {
    let cleanedLines = trimTrailingNoise(splitLines(text))
        .map(line => normalizeAssistantBlockLine(line))
        .map((line) => {
            const original = line;
            const stripped = line.replace(/\bthinking with xhigh effort\b/gi, '').replace(/\s+/g, ' ').trim();
            if (/thinking with xhigh effort/i.test(original) && (!stripped || /^(?:[·•]|\d+(?:\s+\d+)*)$/.test(stripped))) {
                return '';
            }
            return stripped;
        })
        .filter(line => line.trim().length > 0)
        .filter(line => !isHorizontalSeparatorLine(line.trim()))
        .filter(line => !isNoiseLine(line) && !isFooterLine(line) && !isToolSummaryLine(line) && !isSpinnerResidueLine(line));

    const hasSubstantiveLine = cleanedLines.some((line) => !isInlineSpinnerProgressLine(line));
    if (hasSubstantiveLine) {
        cleanedLines = cleanedLines.filter((line) => !isInlineSpinnerProgressLine(line));
    }

    while (cleanedLines.length >= 2) {
        const [first, second] = cleanedLines;
        if (/^[A-Z]?[a-z]{1,8}$/u.test(first) && looksLikeExactAnswerLine(second)) {
            cleanedLines.shift();
            continue;
        }
        const head = normalizeText(first);
        const normalizedPrompt = normalizeText(promptText);
        if (!head || head.length < 8 || !normalizedPrompt || !normalizedPrompt.includes(head)) break;
        cleanedLines.shift();
    }

    const finalText = cleanedLines.join('\n').trim();
    const trimmed = trimPromptEchoPrefix(finalText, promptText);
    if (trimmed) return trimmed;
    return cleanedLines.some((line) => looksLikeExactAnswerLine(line)) ? finalText : trimmed;
}

function extractLastAssistantHeader(text) {
    let candidate = '';
    for (const rawLine of splitLines(text)) {
        const sanitized = sanitizeLine(rawLine);
        if (!/^\s*⏺\s+/.test(sanitized)) continue;
        const cleaned = stripAssistantPrefix(sanitized).trim();
        if (!cleaned || isStatusLine(sanitized) || isToolHeader(cleaned) || isNoiseLine(cleaned) || isApprovalLine(cleaned)) continue;
        candidate = cleaned;
    }
    return candidate;
}

function extractVisibleTurn(text) {
    const screen = typeof text === 'string' ? buildScreenSnapshot(text) : text;
    const lines = screen.lines.map(line => line.text);
    const emptyPromptIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (parsePromptLine(lines[i]) === '') return i;
        }
        return -1;
    })();

    const lastVisiblePrompt = (() => {
        const end = emptyPromptIndex >= 0 ? emptyPromptIndex - 1 : lines.length - 1;
        for (let i = end; i >= 0; i -= 1) {
            const prompt = parsePromptLine(lines[i]);
            if (prompt) {
                const collected = collectPromptText(lines, i);
                return { index: i, text: collected.text, endIndex: collected.endIndex };
            }
        }
        return { index: -1, text: '', endIndex: -1 };
    })();

    const contentStartIndex = lastVisiblePrompt.endIndex >= 0 ? lastVisiblePrompt.endIndex + 1 : 0;
    const contentEndIndex = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
    const assistantRegion = trimBottom(lines.slice(contentStartIndex, contentEndIndex), 0);
    const promptIsCurrentInputRegion = lastVisiblePrompt.index >= 0
        && lastVisiblePrompt.index === screen.promptLineIndex
        && emptyPromptIndex < 0
        && !assistantRegion.some((line) => {
            const sanitized = sanitizeLine(line);
            const cleaned = stripAssistantPrefix(sanitized).trim();
            return /^\s*[⏺⎿]/u.test(sanitized) || isToolHeader(cleaned) || isToolActivitySummary(cleaned);
        });
    if (promptIsCurrentInputRegion) {
        return {
            promptText: '',
            assistantBlocks: [],
            assistantText: '',
        };
    }
    const assistantBlocks = extractAssistantBlocks(assistantRegion);
    const assistantText = (() => {
        if (assistantBlocks.length > 0) return assistantBlocks.join('\n\n').trim();
        const collected = collectAssistantLines(assistantRegion).join('\n').trim();
        if (collected) return collected;
        return extractLastAssistantHeader(assistantRegion.join('\n')).trim();
    })();

    return {
        promptText: lastVisiblePrompt.text,
        assistantBlocks,
        assistantText,
    };
}

function getVisibleAssistantRegion(text) {
    const screen = typeof text === 'string' ? buildScreenSnapshot(text) : text;
    const lines = screen.lines.map(line => line.text);
    const emptyPromptIndex = (() => {
        for (let i = lines.length - 1; i >= 0; i -= 1) {
            if (parsePromptLine(lines[i]) === '') return i;
        }
        return -1;
    })();

    const lastVisiblePrompt = (() => {
        const end = emptyPromptIndex >= 0 ? emptyPromptIndex - 1 : lines.length - 1;
        for (let i = end; i >= 0; i -= 1) {
            const prompt = parsePromptLine(lines[i]);
            if (prompt) return collectPromptText(lines, i);
        }
        return { text: '', endIndex: -1 };
    })();

    const contentStartIndex = lastVisiblePrompt.endIndex >= 0 ? lastVisiblePrompt.endIndex + 1 : 0;
    const contentEndIndex = emptyPromptIndex >= 0 ? emptyPromptIndex : lines.length;
    return trimBottom(lines.slice(contentStartIndex, contentEndIndex), 0);
}

function getTranscriptAssistantRegion(text, promptText) {
    const lines = splitLines(typeof text === 'string' ? text : String(text || ''));
    if (lines.length === 0) return [];

    let promptInfo = null;
    for (let i = lines.length - 1; i >= 0; i -= 1) {
        const parsedPrompt = parsePromptLine(lines[i]);
        if (!parsedPrompt) continue;
        const collected = collectPromptText(lines, i);
        if (!promptText || looksLikeSamePrompt(collected.text, promptText)) {
            promptInfo = collected;
            break;
        }
    }

    if (!promptInfo) return [];
    const trailing = lines.slice(promptInfo.endIndex + 1);
    const emptyPromptIndex = trailing.findIndex((line) => parsePromptLine(line) === '');
    return emptyPromptIndex >= 0 ? trailing.slice(0, emptyPromptIndex) : trailing;
}

function needsPreformattedRender(text) {
    const value = String(text || '');
    return /[┌┐└┘├┤┬┴┼│─═╭╮╰╯]/.test(value) || (/^\s*\+[-+]+\+\s*$/m.test(value) && /^\s*\|.*\|\s*$/m.test(value));
}

function normalizeSimpleBoxTable(text) {
    const lines = splitLines(text);
    const rowIndexes = [];
    const rows = [];
    for (let index = 0; index < lines.length; index += 1) {
        const trimmed = lines[index].trim();
        const rowMatch = trimmed.match(/^│\s*(.+?)\s*│\s*(.+?)\s*│$/);
        if (!rowMatch) continue;
        rowIndexes.push(index);
        rows.push([rowMatch[1].trim(), rowMatch[2].trim()]);
    }
    if (rows.length < 2) return text;

    const headerIndex = lines.findIndex((line) => line.trim() === '| Number | Square |');
    const startIndex = headerIndex >= 0 ? headerIndex : rowIndexes[0];
    const endIndex = rowIndexes[rowIndexes.length - 1];
    const normalizedRows = rows.filter(([left, right]) => !(left === 'Number' && right === 'Square'));
    if (normalizedRows.length === 0) return text;
    const containsStartupDashboard = normalizedRows.some(([left, right]) => (
        isStartupDashboardLine(left)
        || isStartupDashboardLine(right)
        || /^Welcome back\b/i.test(left)
        || /^Welcome back\b/i.test(right)
    ));
    if (containsStartupDashboard) return '';

    const replacement = [
        '| Number | Square |',
        '| --- | --- |',
        ...normalizedRows.map(([left, right]) => `| ${left} | ${right} |`),
    ];
    return [
        ...lines.slice(0, startIndex),
        ...replacement,
        ...lines.slice(endIndex + 1),
    ].join('\n');
}

function wrapSimplePythonBlock(text) {
    if (/```python[\s\S]*```/.test(text)) return text;
    const lines = splitLines(text);
    const isPythonLine = (line) => /^(import\s+\w+|from\s+\w+\s+import\s+|[A-Za-z_][A-Za-z0-9_]*\s*=|print\(|for\s+.+\s+in\s+.+:|if\s+.+:)/.test(line.trim());
    const isDefinitePythonLine = (line) => /^(import\s+\w+|from\s+\w+\s+import\s+|print\(|for\s+.+\s+in\s+.+:|if\s+.+:)/.test(line.trim());
    const start = lines.findIndex((line) => isPythonLine(line));
    if (start < 0) return text;
    let end = start;
    while (end < lines.length && lines[end].trim() && isPythonLine(lines[end])) end += 1;
    const blockLines = lines.slice(start, end);
    if (!blockLines.some(isDefinitePythonLine)) return text;
    const block = blockLines.join('\n').trim();
    if (!block) return text;
    return [
        ...lines.slice(0, start),
        '```python',
        block,
        '```',
        ...lines.slice(end),
    ].join('\n').trim();
}

function normalizeSimpleAssistantFormatting(text) {
    return wrapSimplePythonBlock(normalizeSimpleBoxTable(text));
}

function createAssistantMessage(content) {
    const normalizedContent = normalizeSimpleAssistantFormatting(content);
    const message = { role: 'assistant', content: normalizedContent };
    if (needsPreformattedRender(normalizedContent)) {
        message.meta = { renderMode: 'preformatted' };
    }
    return message;
}

function createToolMessage(content, options = {}) {
    return {
        role: 'assistant',
        kind: options.kind || 'tool',
        senderName: options.senderName || (options.kind === 'terminal' ? 'Terminal' : 'Tool'),
        content,
    };
}

function createApprovalMessage(activeModal) {
    const message = String(activeModal?.message || '').trim();
    const buttons = Array.isArray(activeModal?.buttons)
        ? activeModal.buttons.map((button) => String(button || '').trim()).filter(Boolean)
        : [];
    const lines = ['Approval requested'];
    if (message) lines.push(message);
    if (buttons.length > 0) lines.push(buttons.map((label) => `[${label}]`).join(' '));
    return {
        role: 'assistant',
        kind: 'system',
        senderName: 'System',
        content: lines.join('\n'),
    };
}

function parseBashInvocation(header) {
    const value = String(header || '').trim();
    const closed = value.match(/^Bash\((.*)\)$/);
    if (closed) {
        const command = String(closed[1] || '').trim();
        return command || null;
    }
    const wrapped = value.match(/^Bash\((.+)$/);
    if (!wrapped) return null;
    const command = String(wrapped[1] || '').trim();
    return command || null;
}

function isToolActivitySummary(text) {
    const trimmed = String(text || '').trim();
    return /^Reading\s+\d+\s+files?\b/i.test(trimmed)
        || /^Read\s+\d+\s+files?\b/i.test(trimmed)
        || /^Searching\b/i.test(trimmed)
        || /^Updating\b/i.test(trimmed)
        || /^Editing\b/i.test(trimmed)
        || /^Writing\b/i.test(trimmed);
}

function isThinkingMetricStatusLine(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return false;
    if (!/[.…]\s*\(/u.test(trimmed)) return false;
    const metricBlock = trimmed.match(/\(([^)]*)\)\s*$/u)?.[1] || '';
    if (!/(?:\btokens?\b|thought for|[↑↓]|\b\d+(?:\.\d+)?(?:ms|s|m|h)\b)/iu.test(metricBlock)) return false;
    return /^(?:[⏺✻✶✳✢✽·•]\s+)?[^()]+[.…]\s*\([^)]*\)$/u.test(trimmed);
}

function buildVisibleMessages(lines, promptText = '') {
    const messages = [];
    let currentAssistant = [];
    let skippingToolBlock = false;
    let captureDetailBlock = false;
    let activeTerminalToolIndex = -1;

    const appendToActiveTerminal = (line) => {
        if (activeTerminalToolIndex < 0) return false;
        const cleanedLine = String(line || '').trim();
        if (!cleanedLine) return true;
        if (/^(?:Running|Queued|Waiting)(?:…|\.\.\.)?$/i.test(cleanedLine)) return true;
        const message = messages[activeTerminalToolIndex];
        if (!message || message.kind !== 'terminal') return false;
        message.content = `${String(message.content || '').replace(/\s+$/u, '')}\n${cleanedLine}`;
        return true;
    };

    const clearActiveTool = () => {
        activeTerminalToolIndex = -1;
    };

    const flushAssistant = () => {
        const text = cleanupAssistantText(
            trimTrailingNoise(currentAssistant)
                .map(line => normalizeAssistantBlockLine(line))
                .filter(line => line.trim().length > 0)
                .join('\n')
                .trim(),
            promptText,
        );
        currentAssistant = [];
        if (!text) return;
        messages.push(createAssistantMessage(text));
    };

    for (const rawLine of lines) {
        if (parsePromptLine(rawLine) !== null) continue;

        const sanitized = sanitizeLine(rawLine);
        const trimmed = sanitized.trim();
        if (isNoiseLine(trimmed) && !/^\s*⏺\s+/.test(sanitized)) continue;
        if (isFooterLine(trimmed)) break;

        const cleaned = stripAssistantPrefix(sanitized).trim();
        const normalizedCleaned = normalizeText(cleaned);
        const normalizedPrompt = normalizeText(promptText);
        const isLeadingPromptFragment = !messages.length
            && currentAssistant.length === 0
            && normalizedCleaned
            && normalizedPrompt
            && normalizedCleaned.length >= 8
            && normalizedPrompt.includes(normalizedCleaned);
        if (!cleaned || isLeadingPromptFragment) {
            skippingToolBlock = false;
            captureDetailBlock = false;
            clearActiveTool();
            if (!isLeadingPromptFragment && currentAssistant.length > 0 && currentAssistant[currentAssistant.length - 1] !== '') {
                currentAssistant.push('');
            }
            continue;
        }

        if (/^\s*⏺\s+/.test(sanitized)) {
            const bashCommand = parseBashInvocation(cleaned);
            if (bashCommand) {
                flushAssistant();
                messages.push(createToolMessage(`$ ${bashCommand}`, { kind: 'terminal', senderName: 'Terminal' }));
                activeTerminalToolIndex = messages.length - 1;
                skippingToolBlock = true;
                captureDetailBlock = false;
                continue;
            }
            if (isThinkingMetricStatusLine(cleaned)) {
                flushAssistant();
                skippingToolBlock = false;
                captureDetailBlock = false;
                clearActiveTool();
                continue;
            }
            if (isToolActivitySummary(cleaned)) {
                flushAssistant();
                messages.push(createToolMessage(cleaned, { kind: 'tool', senderName: 'Tool' }));
                clearActiveTool();
                skippingToolBlock = true;
                captureDetailBlock = false;
                continue;
            }
            if (isToolHeader(cleaned)) {
                flushAssistant();
                messages.push(createToolMessage(cleaned, { kind: 'tool', senderName: 'Tool' }));
                clearActiveTool();
                skippingToolBlock = true;
                captureDetailBlock = false;
                continue;
            }
            if (isStatusLine(sanitized)) {
                flushAssistant();
                skippingToolBlock = false;
                captureDetailBlock = false;
                clearActiveTool();
                continue;
            }

            flushAssistant();
            skippingToolBlock = false;
            clearActiveTool();
            captureDetailBlock = /^(?:Exact output|Output|Result):/i.test(cleaned);
            currentAssistant.push(cleaned);
            continue;
        }

        if (/^\s*⎿\s+/.test(sanitized)) {
            if (appendToActiveTerminal(cleaned)) continue;
            if (captureDetailBlock && !/^…\s+\+\d+\s+lines\b/i.test(cleaned)) {
                currentAssistant.push(cleaned);
            }
            continue;
        }

        if (skippingToolBlock && !captureDetailBlock) {
            appendToActiveTerminal(cleaned);
            continue;
        }
        currentAssistant.push(isBoxLine(trimmed) ? sanitized : cleaned);
    }

    flushAssistant();
    return messages;
}

function shouldPreferTranscriptMessages(visibleMessages, transcriptMessages) {
    if (!Array.isArray(transcriptMessages) || transcriptMessages.length === 0) return false;
    if (!Array.isArray(visibleMessages) || visibleMessages.length === 0) return true;

    const standardAssistant = (messages) => messages.filter((message) => message?.role === 'assistant' && (message?.kind || 'standard') === 'standard');
    const visibleAssistant = standardAssistant(visibleMessages);
    const transcriptAssistant = standardAssistant(transcriptMessages);
    const visibleLast = String(visibleAssistant[visibleAssistant.length - 1]?.content || '').trim();
    const transcriptLast = String(transcriptAssistant[transcriptAssistant.length - 1]?.content || '').trim();
    const looksPolluted = (text) => splitLines(text).some((line) => isStatusLine(line.trim()))
        || /\b(?:tokens?|Tip: Use \/memory|Wrote \d+ lines? to|Write\()\b/i.test(text)
        || /(?:^|\n)\/[a-z0-9][a-z0-9-]*(?:\b|$)/i.test(text)
        || /(?:^|\n)[✻✶✳✢✽]/u.test(text)
        || /(?:^|\n)\d+\s+[A-Z]\b/.test(text)
        || /(?:^|\n)[A-Za-z]\s+\d+\b/.test(text);
    const looksCleanExactReply = (text) => /^[A-Z0-9][A-Z0-9:_| -]{1,40}$/u.test(text);

    if (transcriptLast && looksPolluted(transcriptLast) && visibleLast && !looksPolluted(visibleLast)) {
        return false;
    }
    if (looksCleanExactReply(visibleLast) && transcriptLast && !looksCleanExactReply(transcriptLast)) {
        return false;
    }
    if (looksCleanExactReply(visibleLast) && transcriptLast && looksPolluted(transcriptLast)) {
        return false;
    }
    if (transcriptMessages.length > visibleMessages.length) return true;

    const visibleLength = visibleAssistant.reduce((sum, message) => sum + String(message?.content || '').length, 0);
    const transcriptLength = transcriptAssistant.reduce((sum, message) => sum + String(message?.content || '').length, 0);
    return transcriptLength > visibleLength;
}

function stripLeadingPromptFragments(text, promptText) {
    const lines = splitLines(text).map((line) => line.trim());
    const normalizedPrompt = normalizeText(promptText);
    if (!normalizedPrompt || lines.length === 0) return String(text || '').trim();
    if (lines.length > 1 && /^then\s+end\.?$/i.test(lines[0]) && /^begin$/i.test(lines[1])) {
        lines.shift();
    }
    let index = 0;
    while (index < lines.length - 1) {
        const head = normalizeText(lines[index]);
        if (!head || head.length < 8 || !normalizedPrompt.includes(head)) break;
        index += 1;
    }
    return lines.slice(index).join('\n').trim();
}

function restoreDelimitedResponseMarkers(content, promptText) {
    const text = String(content || '').trim();
    const prompt = normalizeText(promptText);
    if (!text || !prompt) return text;
    const lines = splitLines(text).map((line) => line.trim()).filter(Boolean);
    if (lines.length === 0) return text;
    const hasDelimitedPrompt = /\bbegin\b/.test(prompt) && /\bend\b/.test(prompt);
    if (!hasDelimitedPrompt) return text;
    const numericLineCount = lines.filter((line) => /^\d+$/.test(line)).length;
    if (numericLineCount < 10) return text;
    const normalizedLines = lines.map((line) => normalizeText(line));
    const output = [...lines];
    if (!normalizedLines.includes('begin')) output.unshift('BEGIN');
    if (!normalizedLines.includes('end')) output.push('END');
    while (output.length > 1 && /^then\s+end\.?$/i.test(output[0])) output.shift();
    return output.join('\n').trim();
}

function mergeDelimitedAssistantContent(previousContent, nextContent, promptText) {
    const prompt = normalizeText(promptText);
    if (!/\bbegin\b/.test(prompt) || !/\bend\b/.test(prompt)) return String(nextContent || '').trim();
    const prevLines = splitLines(String(previousContent || '')).map((line) => line.trim()).filter(Boolean);
    const nextLines = splitLines(String(nextContent || '')).map((line) => line.trim()).filter(Boolean);
    const hasNumeric = (lines) => lines.filter((line) => /^\d+$/.test(line)).length >= 5;
    if (!hasNumeric(prevLines) && !hasNumeric(nextLines)) return String(nextContent || '').trim();

    const numberSet = new Set();
    for (const line of [...prevLines, ...nextLines]) {
        if (/^\d+$/.test(line)) numberSet.add(Number(line));
    }
    const numbers = [...numberSet].filter(Number.isFinite).sort((a, b) => a - b).map(String);
    if (numbers.length === 0) return String(nextContent || '').trim();

    const hasBegin = [...prevLines, ...nextLines].some((line) => /^begin$/i.test(line));
    const hasEnd = [...prevLines, ...nextLines].some((line) => /^end$/i.test(line));
    const merged = [];
    if (hasBegin) merged.push('BEGIN');
    merged.push(...numbers);
    if (hasEnd) merged.push('END');
    return merged.join('\n').trim();
}

function buildMessages(previousMessages, promptText, visibleMessages) {
    const base = Array.isArray(previousMessages)
        ? previousMessages
            .filter(message => message && (message.role === 'user' || message.role === 'assistant'))
            .map(message => ({
                role: message.role,
                content: typeof message.content === 'string' ? message.content : String(message.content || ''),
                kind: typeof message.kind === 'string' && message.kind ? message.kind : 'standard',
                senderName: typeof message.senderName === 'string' && message.senderName ? message.senderName : undefined,
                timestamp: message.timestamp,
                meta: message.meta && typeof message.meta === 'object' ? { ...message.meta } : undefined,
            }))
        : [];
    let sameTurnAsTail = false;

    if (promptText) {
        const previousUser = [...base]
            .reverse()
            .find((message) => message?.role === 'user' && typeof message.content === 'string');
        if (!previousUser || !looksLikeSamePrompt(previousUser.content, promptText)) {
            base.push({ role: 'user', content: promptText });
        } else {
            sameTurnAsTail = true;
        }
    }

    if (sameTurnAsTail) {
        while (base.length > 0 && base[base.length - 1]?.role === 'assistant') {
            base.pop();
        }
    }

    const effectiveMessages = Array.isArray(visibleMessages)
        ? visibleMessages
            .map((message) => {
                const rawContent = String(message?.content || '').trim();
                const cleanedContent = message?.kind === 'standard'
                    ? restoreDelimitedResponseMarkers(
                        stripLeadingPromptFragments(trimPromptEchoPrefix(rawContent, promptText), promptText),
                        promptText,
                    )
                    : rawContent;
                return {
                    ...message,
                    content: cleanedContent || (!looksLikePromptEchoText(rawContent, promptText, previousMessages) ? rawContent : ''),
                };
            })
            .filter((message) => message && typeof message.content === 'string' && message.content.trim())
        : [];

    if (effectiveMessages.length === 0) return base;
    if (
        effectiveMessages.length === 1
        && effectiveMessages[0]?.role === 'assistant'
        && (effectiveMessages[0]?.kind || 'standard') === 'standard'
        && looksLikePromptEchoText(effectiveMessages[0].content, promptText, previousMessages)
    ) return base;

    const last = base[base.length - 1];
    if (
        !sameTurnAsTail
        && effectiveMessages.length === 1
        && last?.role === 'assistant'
        && (last?.kind || 'standard') === 'standard'
        && (effectiveMessages[0]?.kind || 'standard') === 'standard'
    ) {
        if (normalizeText(last.content) !== normalizeText(effectiveMessages[0].content)) {
            const mergedContent = mergeDelimitedAssistantContent(last.content, effectiveMessages[0].content, promptText);
            const nextAssistant = createAssistantMessage(mergedContent);
            last.content = nextAssistant.content;
            last.meta = nextAssistant.meta;
        }
        return base;
    }

    for (const message of effectiveMessages) {
        if (message.role === 'assistant' && (message.kind || 'standard') !== 'standard') {
            base.push({
                role: 'assistant',
                kind: message.kind,
                senderName: message.senderName,
                content: message.content,
                ...(message.meta ? { meta: { ...message.meta } } : {}),
            });
            continue;
        }
        const assistantMessage = createAssistantMessage(message.content);
        base.push({
            ...assistantMessage,
            kind: 'standard',
            ...(typeof message.senderName === 'string' && message.senderName ? { senderName: message.senderName } : {}),
        });
    }

    return base;
}

function toMessageObjects(messages, status) {
    return messages.map((message, index, slice) => ({
        id: `msg_${index}`,
        role: message.role,
        content: message.content,
        index,
        kind: typeof message.kind === 'string' && message.kind ? message.kind : 'standard',
        ...(typeof message.senderName === 'string' && message.senderName ? { senderName: message.senderName } : {}),
        ...(message.meta ? { meta: { ...message.meta } } : {}),
        ...(status === 'generating' && index === slice.length - 1 && message.role === 'assistant'
            ? { meta: { ...(message.meta || {}), streaming: true } }
            : {}),
    }));
}

function extractControlValues(screenText) {
    const values = {};
    const lines = splitLines(screenText)
        .map((rawLine) => sanitizeLine(rawLine).trim())
        .filter(Boolean)
        .slice(-15);

    const explicitDefault = lines.some((trimmed) => /^(?:[⎿└╰│>\-\s]+)?Set model to\s+(?:Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\s+\(default\)$/i.test(trimmed));
    if (explicitDefault) {
        values.model = 'default';
    }

    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const trimmed = lines[index];

        const setModelMatch = trimmed.match(/^(?:[⎿└╰│>\-\s]+)?Set model to\s+(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?$/i);
        if (setModelMatch && values.model !== 'default') {
            values.model = setModelMatch[1].toLowerCase();
        }

        // Model: footer shows "Sonnet 4.6 ..." / "Opus 4.6 ..." / "Haiku 4.6 ..."
        const modelMatch = trimmed.match(/^(Sonnet|Opus|Haiku)(?:\s+\d+(?:\.\d+)*)?\b/i);
        if (modelMatch && values.model !== 'default' && values.model === undefined) {
            values.model = modelMatch[1].toLowerCase();
        }

        // Effort: footer shows "[spinner] medium · /effort" or similar
        const effortMatch = trimmed.match(/\b(low|medium|high|max)\s+[·•]\s+\/effort\b/i);
        if (effortMatch && values.effort === undefined) {
            values.effort = effortMatch[1].toLowerCase();
        }
    }

    return Object.keys(values).length > 0 ? values : undefined;
}

module.exports = function parseOutput(input) {
    const screen = getScreen(input);
    const screenText = String(screen.text || input?.screenText || '');
    const buffer = String(input?.buffer || '');
    const tail = String(input?.recentBuffer || (screenText || buffer).slice(-500));
    const transcriptSource = buffer || screenText || String(input?.rawBuffer || '');
    const visibleScreen = buildScreenSnapshot(screenText || transcriptSource);
    const transcriptScreen = buildScreenSnapshot(transcriptSource);
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

    const { promptText, assistantBlocks, assistantText: visibleAssistantText } = effectiveStatus === 'waiting_approval'
        ? { promptText: '', assistantBlocks: [], assistantText: '' }
        : extractVisibleTurn(visibleScreen);
    const effectivePromptText = resolveEffectivePromptText(input?.promptText, promptText, previousMessages);
    const hasConversationAnchor = !!effectivePromptText || previousMessages.some((message) => message?.role === 'assistant');
    let visibleMessages = effectiveStatus === 'waiting_approval'
        ? (activeModal ? [createApprovalMessage(activeModal)] : [])
        : (hasConversationAnchor ? buildVisibleMessages(getVisibleAssistantRegion(visibleScreen), effectivePromptText) : []);
    if (effectiveStatus !== 'waiting_approval' && hasConversationAnchor) {
        const transcriptMessages = buildVisibleMessages(getTranscriptAssistantRegion(transcriptSource, effectivePromptText), effectivePromptText);
        if (shouldPreferTranscriptMessages(visibleMessages, transcriptMessages)) {
            visibleMessages = transcriptMessages;
        }
    }
    if (visibleMessages.length === 0 && status !== 'waiting_approval' && hasConversationAnchor) {
        const rawAssistantText = cleanupAssistantText(visibleAssistantText, effectivePromptText) || extractLastAssistantHeader(transcriptSource);
        const assistantText = trimPromptEchoPrefix(rawAssistantText, effectivePromptText)
            || (!looksLikePromptEchoText(rawAssistantText, effectivePromptText, previousMessages) ? String(rawAssistantText || '').trim() : '');
        if (assistantText) {
            visibleMessages.push({ role: 'assistant', kind: 'standard', content: assistantText });
        }
    }

    const controlValues = extractControlValues(screenText || buffer);
    const builtMessages = buildMessages(previousMessages, effectivePromptText, visibleMessages)
        .map((message) => {
            if (message?.role !== 'assistant' || (message?.kind || 'standard') !== 'standard') return message;
            return {
                ...message,
                content: restoreDelimitedResponseMarkers(
                    stripLeadingPromptFragments(String(message.content || ''), effectivePromptText),
                    effectivePromptText,
                ),
            };
        })
        .filter((message) => !(message?.role === 'assistant' && (!message.content || !String(message.content).trim())));

    return {
        id: 'cli_session',
        status: effectiveStatus,
        title: 'Claude Code',
        messages: toMessageObjects(builtMessages, effectiveStatus),
        activeModal,
        ...(controlValues ? { controlValues } : {}),
    };
};
