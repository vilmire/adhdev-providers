'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function statMtimeMs(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
}

function normalizeHistorySessionId(value) {
  return String(value || '').trim();
}

function isSafeNativeHistorySessionId(sessionId) {
  return /^[A-Za-z0-9._:-]+$/.test(String(sessionId || '')) && !String(sessionId || '').includes('..');
}

function isUuidLikeSessionId(sessionId) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(sessionId || ''));
}

function resolvePathInside(root, ...segments) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, ...segments);
  if (targetPath !== rootPath && !targetPath.startsWith(rootPath + path.sep)) return null;
  return targetPath;
}

function isPathInside(root, target) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(target);
  return targetPath === rootPath || targetPath.startsWith(rootPath + path.sep);
}

function listFilesRecursive(root, predicate) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (!predicate || predicate(entryPath, entry)) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function extractTimestampValue(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function normalizeCanonicalHermesMessageContent(content) {
  if (typeof content === 'string') return content.trim();
  if (content == null) return '';
  if (Array.isArray(content)) return content.map(normalizeCanonicalHermesMessageContent).filter(Boolean).join('\n').trim();
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content.content === 'string' || Array.isArray(content.content)) return normalizeCanonicalHermesMessageContent(content.content);
    try { return JSON.stringify(content); } catch { return ''; }
  }
  return String(content).trim();
}

function extractCanonicalHermesMessageTimestamp(message, fallbackTs) {
  const numericTimestamp = Number(message.receivedAt || message.timestamp || message.ts || 0);
  if (Number.isFinite(numericTimestamp) && numericTimestamp > 0) return numericTimestamp;
  const stringTimestamp = typeof message.ts === 'string'
    ? Date.parse(message.ts)
    : (typeof message.timestamp === 'string' ? Date.parse(message.timestamp) : NaN);
  return Number.isFinite(stringTimestamp) && stringTimestamp > 0 ? stringTimestamp : fallbackTs;
}

function hermesSessionsRoot() {
  return path.join(os.homedir(), '.hermes', 'sessions');
}

function hermesSessionPath(sessionId) {
  if (!isSafeNativeHistorySessionId(sessionId)) return null;
  return resolvePathInside(hermesSessionsRoot(), `session_${sessionId}.json`);
}

function resolveHermesSession(sessionId) {
  const normalized = normalizeHistorySessionId(sessionId);
  const sourcePath = hermesSessionPath(normalized);
  if (!sourcePath || !fs.existsSync(sourcePath)) return null;
  return { sessionId: normalized, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
}

function listHermesSessions() {
  return listFilesRecursive(hermesSessionsRoot(), (_entryPath, entry) => entry.isFile() && /^session_.+\.json$/.test(entry.name))
    .map((sourcePath) => {
      const sessionId = path.basename(sourcePath).replace(/^session_/, '').replace(/\.json$/, '');
      if (!isSafeNativeHistorySessionId(sessionId)) return null;
      return { sessionId, historySessionId: sessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
    })
    .filter(Boolean);
}

function readHermesSessionRef(ref) {
  if (!ref || !isSafeNativeHistorySessionId(ref.sessionId) || !isPathInside(hermesSessionsRoot(), ref.sourcePath)) return null;
  const expectedPath = hermesSessionPath(ref.sessionId);
  if (!expectedPath || path.resolve(expectedPath) !== path.resolve(ref.sourcePath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(ref.sourcePath, 'utf-8'));
    const canonicalMessages = Array.isArray(raw.messages) ? raw.messages : [];
    const records = [];
    let fallbackTs = Date.parse(raw.session_start || raw.last_updated || '') || Date.now();
    for (const message of canonicalMessages) {
      const role = String(message.role || '').trim();
      const content = normalizeCanonicalHermesMessageContent(message.content);
      if (!content) continue;
      const receivedAt = extractCanonicalHermesMessageTimestamp(message, fallbackTs);
      fallbackTs = receivedAt + 1;
      if (role === 'user' || role === 'assistant') {
        records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role, content, kind: 'standard', agent: 'hermes-cli', historySessionId: ref.sessionId });
      } else if (role === 'tool') {
        records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'hermes-cli', historySessionId: ref.sessionId });
      }
    }
    return records;
  } catch {
    return null;
  }
}

function readHermesNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const ref = resolveHermesSession(sessionId);
  if (!ref) return null;
  const messages = readHermesSessionRef(ref);
  return messages ? { messages, sourcePath: ref.sourcePath, sourceMtimeMs: ref.sourceMtimeMs } : null;
}

function listHermesNativeHistory() {
  const sessions = [];
  for (const ref of listHermesSessions()) {
    const messages = readHermesSessionRef(ref) || [];
    const summary = buildSummary('hermes-cli', ref, messages);
    if (summary) sessions.push(summary);
  }
  return { sessions: sortSummaries(sessions) };
}

function resolveClaudeProjectTranscriptPath(historySessionId, workspace) {
  const normalized = normalizeHistorySessionId(historySessionId);
  if (!isSafeNativeHistorySessionId(normalized)) return null;
  const root = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(root)) return null;
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (normalizedWorkspace) {
    const workspaceDir = normalizedWorkspace.replace(/[\\/]/g, '-');
    const directPath = resolvePathInside(root, workspaceDir, `${normalized}.jsonl`);
    if (directPath && fs.existsSync(directPath)) return directPath;
  }
  return listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && entry.name === `${normalized}.jsonl`)[0] || null;
}

function extractClaudeAssistantContentParts(content) {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? [{ content: trimmed, kind: 'standard' }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const type = String(block.type || '').trim();
    if (type === 'text') {
      const text = String(block.text || '').trim();
      if (text) parts.push({ content: text, kind: 'standard' });
    } else if (type === 'tool_use') {
      const name = String(block.name || '').trim() || 'Tool';
      const input = block.input && typeof block.input === 'object' ? block.input : null;
      const command = input ? String(input.command || '').trim() : '';
      parts.push({ content: command ? `${name}: ${command}` : name, kind: 'tool', senderName: 'Tool' });
    }
  }
  return parts;
}

function extractClaudeUserContentParts(content) {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed ? [{ role: 'user', content: trimmed, kind: 'standard' }] : [];
  }
  if (!Array.isArray(content)) return [];
  const parts = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    const type = String(block.type || '').trim();
    if (type === 'text') {
      const text = String(block.text || '').trim();
      if (text) parts.push({ role: 'user', content: text, kind: 'standard' });
    } else if (type === 'tool_result') {
      const raw = block.content;
      const text = typeof raw === 'string'
        ? raw.trim()
        : Array.isArray(raw)
          ? raw.map((entry) => {
              if (typeof entry === 'string') return entry.trim();
              if (!entry || typeof entry !== 'object') return '';
              if (typeof entry.text === 'string') return entry.text.trim();
              if (typeof entry.content === 'string') return entry.content.trim();
              return '';
            }).filter(Boolean).join('\n')
          : '';
      if (text) parts.push({ role: 'assistant', content: text, kind: 'tool', senderName: 'Tool' });
    }
  }
  return parts;
}

function resolveClaudeSession(sessionId, workspace) {
  const normalized = normalizeHistorySessionId(sessionId);
  const sourcePath = resolveClaudeProjectTranscriptPath(normalized, workspace);
  return sourcePath ? { sessionId: normalized, historySessionId: normalized, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), workspace } : null;
}

function listClaudeSessions() {
  const root = path.join(os.homedir(), '.claude', 'projects');
  return listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((sourcePath) => {
      const sessionId = path.basename(sourcePath, '.jsonl');
      if (!isSafeNativeHistorySessionId(sessionId)) return null;
      return { sessionId, historySessionId: sessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
    })
    .filter(Boolean);
}

function readClaudeSessionRef(ref) {
  const root = path.join(os.homedir(), '.claude', 'projects');
  if (!ref || !isSafeNativeHistorySessionId(ref.sessionId) || !isPathInside(root, ref.sourcePath)) return null;
  if (path.basename(ref.sourcePath) !== `${ref.sessionId}.jsonl`) return null;
  try {
    const lines = fs.readFileSync(ref.sourcePath, 'utf-8').split('\n').filter(Boolean);
    const records = [];
    let fallbackTs = Date.now();
    for (const line of lines) {
      let parsed = null;
      try { parsed = JSON.parse(line); } catch { parsed = null; }
      if (!parsed) continue;
      const parsedSessionId = String(parsed.sessionId || '').trim();
      if (parsedSessionId && parsedSessionId !== ref.sessionId) continue;
      const receivedAt = extractTimestampValue(parsed.timestamp) || fallbackTs;
      fallbackTs = receivedAt + 1;
      const parsedWorkspace = String(parsed.cwd || ref.workspace || '').trim();
      if (records.length === 0 && parsedWorkspace) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'system', kind: 'session_start', content: parsedWorkspace, agent: 'claude-cli', historySessionId: ref.sessionId, workspace: parsedWorkspace });
      const type = String(parsed.type || '').trim();
      const message = parsed.message && typeof parsed.message === 'object' ? parsed.message : null;
      if (type === 'user' && message) {
        for (const part of extractClaudeUserContentParts(message.content)) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: part.role, content: part.content, kind: part.kind, senderName: part.senderName, agent: 'claude-cli', historySessionId: ref.sessionId });
      } else if (type === 'assistant' && message) {
        for (const part of extractClaudeAssistantContentParts(message.content)) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content: part.content, kind: part.kind, senderName: part.senderName, agent: 'claude-cli', historySessionId: ref.sessionId });
      }
    }
    return records;
  } catch {
    return null;
  }
}

function readClaudeNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const ref = resolveClaudeSession(sessionId, workspace);
  if (!ref) return null;
  const messages = readClaudeSessionRef(ref);
  return messages ? { messages, sourcePath: ref.sourcePath, sourceMtimeMs: ref.sourceMtimeMs } : null;
}

function listClaudeNativeHistory() {
  const sessions = [];
  for (const ref of listClaudeSessions()) {
    const messages = readClaudeSessionRef(ref) || [];
    const summary = buildSummary('claude-cli', ref, messages);
    if (summary) sessions.push(summary);
  }
  return { sessions: sortSummaries(sessions) };
}

function readCodexSessionMeta(filePath) {
  try {
    const firstLine = fs.readFileSync(filePath, 'utf-8').split('\n').find(Boolean);
    if (!firstLine) return null;
    const parsed = JSON.parse(firstLine);
    if (String(parsed.type || '') !== 'session_meta') return null;
    return parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
  } catch {
    return null;
  }
}

function resolveCodexSessionTranscriptPath(historySessionId, workspace) {
  const normalized = normalizeHistorySessionId(historySessionId);
  if (!normalized || !isUuidLikeSessionId(normalized)) return null;
  const root = path.join(os.homedir(), '.codex', 'sessions');
  if (!fs.existsSync(root)) return null;
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  const candidates = [];
  for (const sourcePath of listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && entry.name.endsWith('.jsonl') && entry.name.includes(normalized))) {
    const meta = readCodexSessionMeta(sourcePath);
    const metaSessionId = String(meta?.id || '').trim();
    if (metaSessionId && metaSessionId !== normalized) continue;
    const metaWorkspace = String(meta?.cwd || '').trim();
    candidates.push({ path: sourcePath, mtimeMs: statMtimeMs(sourcePath), workspaceMatches: !!normalizedWorkspace && metaWorkspace === normalizedWorkspace, metaMatches: metaSessionId === normalized });
  }
  candidates.sort((a, b) => Number(b.workspaceMatches) - Number(a.workspaceMatches) || Number(b.metaMatches) - Number(a.metaMatches) || b.mtimeMs - a.mtimeMs);
  return candidates[0]?.path || null;
}

function flattenCodexContent(content) {
  if (typeof content === 'string') return content.trim();
  if (content == null) return '';
  if (Array.isArray(content)) return content.map(flattenCodexContent).filter(Boolean).join('\n').trim();
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text.trim();
    if (typeof content.content === 'string' || Array.isArray(content.content)) return flattenCodexContent(content.content);
    if (typeof content.output === 'string') return content.output.trim();
    if (typeof content.message === 'string') return content.message.trim();
  }
  return '';
}

function summarizeCodexToolArguments(value) {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(String).join(' ').trim();
  if (!value || typeof value !== 'object') return '';
  const direct = value.command || value.cmd || value.query || value.path || value.prompt;
  if (typeof direct === 'string') return direct.trim();
  if (Array.isArray(direct)) return direct.map(String).join(' ').trim();
  try { return JSON.stringify(value).trim(); } catch { return ''; }
}

function summarizeCodexToolCall(payload) {
  const name = String(payload.name || payload.type || 'tool').trim() || 'tool';
  const rawArguments = payload.arguments ?? payload.input;
  let argumentValue = '';
  if (typeof rawArguments === 'string') {
    const trimmed = rawArguments.trim();
    try { argumentValue = summarizeCodexToolArguments(JSON.parse(trimmed)); } catch { argumentValue = trimmed; }
  } else {
    argumentValue = summarizeCodexToolArguments(rawArguments);
  }
  return argumentValue ? `${name}: ${argumentValue}` : name;
}

function codexToolOutputContent(payload) {
  const output = payload.output ?? payload.result ?? payload.content;
  const text = flattenCodexContent(output);
  if (text) return text;
  if (output && typeof output === 'object') {
    try { return JSON.stringify(output).trim(); } catch { return ''; }
  }
  return '';
}

function resolveCodexSession(sessionId, workspace) {
  const normalized = normalizeHistorySessionId(sessionId);
  const sourcePath = resolveCodexSessionTranscriptPath(normalized, workspace);
  if (!sourcePath) return null;
  const meta = readCodexSessionMeta(sourcePath);
  return { sessionId: normalized, historySessionId: normalized, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), workspace: String(meta?.cwd || workspace || '').trim() || undefined };
}

function listCodexSessions() {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  return listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((sourcePath) => {
      const meta = readCodexSessionMeta(sourcePath);
      const sessionId = String(meta?.id || path.basename(sourcePath).match(uuidPattern)?.[1] || '').trim();
      if (!sessionId) return null;
      return { sessionId, historySessionId: sessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), workspace: String(meta?.cwd || '').trim() || undefined };
    })
    .filter(Boolean);
}

function readCodexSessionRef(ref) {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  if (!ref || !isUuidLikeSessionId(ref.sessionId) || !isPathInside(root, ref.sourcePath)) return null;
  try {
    const lines = fs.readFileSync(ref.sourcePath, 'utf-8').split('\n').filter(Boolean);
    const records = [];
    let fallbackTs = Date.now();
    for (const line of lines) {
      let parsed = null;
      try { parsed = JSON.parse(line); } catch { parsed = null; }
      if (!parsed) continue;
      const receivedAt = extractTimestampValue(parsed.timestamp) || fallbackTs;
      fallbackTs = receivedAt + 1;
      const type = String(parsed.type || '').trim();
      const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;
      if (!payload) continue;
      if (type === 'session_meta') {
        const parsedSessionId = String(payload.id || '').trim();
        if (parsedSessionId && parsedSessionId !== ref.sessionId) return null;
        const parsedWorkspace = String(payload.cwd || ref.workspace || '').trim();
        if (records.length === 0 && parsedWorkspace) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'system', kind: 'session_start', content: parsedWorkspace, agent: 'codex-cli', historySessionId: ref.sessionId, workspace: parsedWorkspace });
        continue;
      }
      if (type !== 'response_item') continue;
      const payloadType = String(payload.type || '').trim();
      if (payloadType === 'message') {
        const role = String(payload.role || '').trim();
        if (role !== 'user' && role !== 'assistant') continue;
        const content = flattenCodexContent(payload.content);
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role, content, kind: 'standard', agent: 'codex-cli', historySessionId: ref.sessionId });
      } else if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
        const content = summarizeCodexToolCall(payload);
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'codex-cli', historySessionId: ref.sessionId });
      } else if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
        const content = codexToolOutputContent(payload);
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'codex-cli', historySessionId: ref.sessionId });
      }
    }
    return records;
  } catch {
    return null;
  }
}

function readCodexNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const ref = resolveCodexSession(sessionId, workspace);
  if (!ref) return null;
  const messages = readCodexSessionRef(ref);
  return messages ? { messages, sourcePath: ref.sourcePath, sourceMtimeMs: ref.sourceMtimeMs } : null;
}

function listCodexNativeHistory() {
  const sessions = [];
  for (const ref of listCodexSessions()) {
    const messages = readCodexSessionRef(ref) || [];
    const summary = buildSummary('codex-cli', ref, messages);
    if (summary) sessions.push(summary);
  }
  return { sessions: sortSummaries(sessions) };
}

function buildSummary(agentType, ref, messages) {
  const visible = Array.isArray(messages) ? messages.filter((message) => message && message.kind !== 'session_start') : [];
  if (visible.length === 0) return null;
  const first = visible[0];
  const last = visible[visible.length - 1];
  const firstSystem = Array.isArray(messages) ? messages.find((message) => message && message.kind === 'session_start') : null;
  return {
    historySessionId: ref.historySessionId || ref.sessionId,
    sessionId: ref.sessionId,
    sessionTitle: last.content,
    messageCount: visible.length,
    firstMessageAt: first.receivedAt || ref.sourceMtimeMs || Date.now(),
    lastMessageAt: last.receivedAt || ref.sourceMtimeMs || Date.now(),
    preview: last.content,
    workspace: ref.workspace || firstSystem?.workspace || firstSystem?.content,
    source: 'provider-native',
    sourcePath: ref.sourcePath,
    sourceMtimeMs: ref.sourceMtimeMs || 0,
    agent: agentType,
  };
}

function sortSummaries(sessions) {
  return sessions.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0) || String(a.historySessionId).localeCompare(String(b.historySessionId)));
}

module.exports = {
  readHermesNativeHistory,
  listHermesNativeHistory,
  readClaudeNativeHistory,
  listClaudeNativeHistory,
  readCodexNativeHistory,
  listCodexNativeHistory,
};
