'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('node:crypto');

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function statMtimeMs(filePath) {
  try { return fs.statSync(filePath).mtimeMs; } catch { return 0; }
}

const CODEX_CACHE_TTL_MS = 2500;
const codexResolveCache = new Map();
const codexReadCache = new Map();
const codexListCache = new Map();
const codexCacheStats = { resolveScans: 0, transcriptParses: 0, listScans: 0, resolveHits: 0, transcriptHits: 0, listHits: 0 };

function nowMs() {
  return Date.now();
}

function readCache(map, key) {
  const entry = map.get(key);
  if (!entry || entry.expiresAt <= nowMs()) {
    if (entry) map.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(map, key, value, ttlMs = CODEX_CACHE_TTL_MS) {
  map.set(key, { value, expiresAt: nowMs() + ttlMs });
  return value;
}

function clearCodexNativeHistoryCaches() {
  codexResolveCache.clear();
  codexReadCache.clear();
  codexListCache.clear();
  for (const key of Object.keys(codexCacheStats)) codexCacheStats[key] = 0;
}

function getCodexNativeHistoryCacheStats() {
  return { ...codexCacheStats };
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

function normalizeWorkspacePath(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return '';
  const resolved = path.resolve(raw);
  try { return fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved); } catch { return resolved; }
}

function workspacePathsMatch(left, right) {
  const a = normalizeWorkspacePath(left);
  const b = normalizeWorkspacePath(right);
  return !!a && !!b && a === b;
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

function extractHermesWorkspace(raw) {
  if (!raw || typeof raw !== 'object') return '';
  const direct = raw.workspace || raw.cwd || raw.projectRoot || raw.project_root || raw.workingDirectory || raw.working_directory;
  if (typeof direct === 'string' && direct.trim()) return direct.trim();
  const project = raw.project && typeof raw.project === 'object' ? raw.project : null;
  const nested = project?.workspace || project?.cwd || project?.root || project?.path;
  return typeof nested === 'string' ? nested.trim() : '';
}

function readHermesSessionRaw(sourcePath) {
  try { return JSON.parse(fs.readFileSync(sourcePath, 'utf-8')); } catch { return null; }
}

function hermesSessionMatchesWorkspace(ref, workspace) {
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) return true;
  const raw = readHermesSessionRaw(ref.sourcePath);
  const sessionWorkspace = extractHermesWorkspace(raw);
  return !sessionWorkspace || workspacePathsMatch(sessionWorkspace, normalizedWorkspace);
}

function resolveHermesSession(sessionId, workspace) {
  const normalized = normalizeHistorySessionId(sessionId);
  if (normalized) {
    const sourcePath = hermesSessionPath(normalized);
    if (!sourcePath || !fs.existsSync(sourcePath)) return null;
    const ref = { sessionId: normalized, historySessionId: normalized, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
    return hermesSessionMatchesWorkspace(ref, workspace) ? ref : null;
  }

  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) return null;
  const candidates = listHermesSessions()
    .filter((ref) => hermesSessionMatchesWorkspace(ref, normalizedWorkspace))
    .sort((a, b) => b.sourceMtimeMs - a.sourceMtimeMs);
  return candidates[0] || null;
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
    const raw = readHermesSessionRaw(ref.sourcePath);
    if (!raw || typeof raw !== 'object') return null;
    const canonicalMessages = Array.isArray(raw.messages) ? raw.messages : [];
    const records = [];
    let fallbackTs = Date.parse(raw.session_start || raw.last_updated || '') || Date.now();
    const workspace = extractHermesWorkspace(raw);
    if (workspace) records.push({ ts: new Date(fallbackTs).toISOString(), receivedAt: fallbackTs, role: 'system', kind: 'session_start', content: workspace, agent: 'hermes-cli', historySessionId: ref.sessionId, workspace });
    for (const message of canonicalMessages) {
      const role = String(message.role || '').trim();
      const content = normalizeCanonicalHermesMessageContent(message.content);
      if (!content) continue;
      const receivedAt = extractCanonicalHermesMessageTimestamp(message, fallbackTs);
      fallbackTs = receivedAt + 1;
      if (role === 'user' || role === 'assistant') {
        records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role, content, kind: 'standard', agent: 'hermes-cli', historySessionId: ref.sessionId, ...(workspace ? { workspace } : {}) });
      } else if (role === 'tool') {
        records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'hermes-cli', historySessionId: ref.sessionId, ...(workspace ? { workspace } : {}) });
      }
    }
    return records;
  } catch {
    return null;
  }
}

function readHermesNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const excludeInProgressTurn = input.excludeInProgressTurn === true || input.args?.excludeInProgressTurn === true;
  const ref = resolveHermesSession(sessionId, workspace);
  if (!ref) return null;
  let messages = readHermesSessionRef(ref);
  if (!messages) return null;
  if (excludeInProgressTurn) messages = trimIncompleteLastTurn(messages);
  return {
    messages,
    providerSessionId: ref.sessionId,
    source: 'provider-native',
    sourcePath: ref.sourcePath,
    sourceMtimeMs: ref.sourceMtimeMs,
    nativeHistoryCoverage: 'full',
  };
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

/**
 * When waiting_approval, strip the trailing in-progress tool call so the
 * user doesn't see a half-rendered tool record. We keep:
 *   - all previous completed turns
 *   - the user prompt that triggered the in-progress turn
 *   - any assistant standard messages already emitted for the in-progress turn
 *     (e.g. "I'll check the mesh status now.") so the dashboard can show what
 *     the assistant is about to do
 * and drop only the trailing assistant.kind === 'tool' records. Previously
 * this function sliced from the last user message onward, which wiped the
 * entire in-progress turn including the user prompt — the dashboard then
 * showed "0 messages" while the terminal clearly displayed the conversation.
 */
function trimIncompleteLastTurn(records) {
  if (!records || records.length === 0) return records;
  const last = records[records.length - 1];
  if (!last || !(last.role === 'assistant' && last.kind === 'tool')) return records;
  let i = records.length - 1;
  while (i >= 0) {
    const r = records[i];
    if (r && r.role === 'assistant' && r.kind === 'tool') { i -= 1; continue; }
    break;
  }
  return records.slice(0, i + 1);
}

function readClaudeNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const excludeInProgressTurn = input.excludeInProgressTurn === true || input.args?.excludeInProgressTurn === true;
  const ref = resolveClaudeSession(sessionId, workspace);
  if (!ref) return null;
  let messages = readClaudeSessionRef(ref);
  if (!messages) return null;
  if (excludeInProgressTurn) messages = trimIncompleteLastTurn(messages);
  return { messages, sourcePath: ref.sourcePath, sourceMtimeMs: ref.sourceMtimeMs };
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
  if (normalized && !isUuidLikeSessionId(normalized)) return null;
  const root = path.join(os.homedir(), '.codex', 'sessions');
  if (!fs.existsSync(root)) return null;
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  const cacheKey = JSON.stringify({ normalized, workspace: normalizeWorkspacePath(normalizedWorkspace) || normalizedWorkspace });
  const cached = readCache(codexResolveCache, cacheKey);
  if (cached !== undefined) {
    codexCacheStats.resolveHits += 1;
    return cached;
  }
  const candidates = [];
  if (!normalized && !normalizedWorkspace) return null;
  codexCacheStats.resolveScans += 1;
  for (const sourcePath of listFilesRecursive(root, (_entryPath, entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) return false;
    return !normalized || entry.name.includes(normalized);
  })) {
    const meta = readCodexSessionMeta(sourcePath);
    const metaSessionId = String(meta?.id || '').trim();
    if (normalized && metaSessionId && metaSessionId !== normalized) continue;
    const metaWorkspace = String(meta?.cwd || '').trim();
    const workspaceMatches = !!normalizedWorkspace && workspacePathsMatch(metaWorkspace, normalizedWorkspace);
    if (normalizedWorkspace && !workspaceMatches) continue;
    if (!normalized && !workspaceMatches) continue;
    candidates.push({ path: sourcePath, mtimeMs: statMtimeMs(sourcePath), workspaceMatches, metaMatches: !!normalized && metaSessionId === normalized });
  }
  candidates.sort((a, b) => Number(b.workspaceMatches) - Number(a.workspaceMatches) || Number(b.metaMatches) - Number(a.metaMatches) || b.mtimeMs - a.mtimeMs);
  return writeCache(codexResolveCache, cacheKey, candidates[0]?.path || null);
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
  const resolvedSessionId = String(meta?.id || normalized || '').trim();
  if (!isUuidLikeSessionId(resolvedSessionId)) return null;
  return { sessionId: resolvedSessionId, historySessionId: resolvedSessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), workspace: String(meta?.cwd || workspace || '').trim() || undefined };
}

function listCodexSessions() {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  const cached = readCache(codexListCache, root);
  if (cached !== undefined) {
    codexCacheStats.listHits += 1;
    return cached;
  }
  const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
  codexCacheStats.listScans += 1;
  const sessions = listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((sourcePath) => {
      const meta = readCodexSessionMeta(sourcePath);
      const sessionId = String(meta?.id || path.basename(sourcePath).match(uuidPattern)?.[1] || '').trim();
      if (!sessionId) return null;
      return { sessionId, historySessionId: sessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), workspace: String(meta?.cwd || '').trim() || undefined };
    })
    .filter(Boolean);
  return writeCache(codexListCache, root, sessions);
}

function readCodexSessionRef(ref) {
  const root = path.join(os.homedir(), '.codex', 'sessions');
  if (!ref || !isUuidLikeSessionId(ref.sessionId) || !isPathInside(root, ref.sourcePath)) return null;
  const mtimeMs = statMtimeMs(ref.sourcePath);
  const cacheKey = `${ref.sourcePath}:${mtimeMs}:${ref.sessionId}`;
  const cached = readCache(codexReadCache, cacheKey);
  if (cached !== undefined) {
    codexCacheStats.transcriptHits += 1;
    return cached;
  }
  try {
    codexCacheStats.transcriptParses += 1;
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
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role, content, kind: 'standard', agent: 'codex-cli', historySessionId: ref.sessionId, ...(ref.workspace ? { workspace: ref.workspace } : {}) });
      } else if (payloadType === 'function_call' || payloadType === 'custom_tool_call') {
        const content = summarizeCodexToolCall(payload);
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'codex-cli', historySessionId: ref.sessionId, ...(ref.workspace ? { workspace: ref.workspace } : {}) });
      } else if (payloadType === 'function_call_output' || payloadType === 'custom_tool_call_output') {
        const content = codexToolOutputContent(payload);
        if (content) records.push({ ts: new Date(receivedAt).toISOString(), receivedAt, role: 'assistant', content, kind: 'tool', senderName: 'Tool', agent: 'codex-cli', historySessionId: ref.sessionId, ...(ref.workspace ? { workspace: ref.workspace } : {}) });
      }
    }
    return writeCache(codexReadCache, cacheKey, records);
  } catch {
    return null;
  }
}

function readCodexNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const excludeInProgressTurn = input.excludeInProgressTurn === true || input.args?.excludeInProgressTurn === true;
  const spawnAt = Number(input.spawnAt) || 0;
  const ref = resolveCodexSession(sessionId, workspace);
  if (!ref) return null;
  // (fix) When workspace-only resolution picks a rollout that existed BEFORE
  // the CLI process was spawned, the conversation we're seeing belongs to a
  // previous run. Returning it stamps the wrong providerSessionId onto the
  // fresh adapter, which then sticks forever. Grace allows codex up to ~3
  // seconds to write its first session_meta row.
  if (spawnAt > 0 && !sessionId && ref.sourceMtimeMs && ref.sourceMtimeMs < spawnAt - 3000) return null;
  let messages = readCodexSessionRef(ref);
  if (!messages) return null;
  if (excludeInProgressTurn) messages = trimIncompleteLastTurn(messages);
  return {
    messages,
    providerSessionId: ref.sessionId,
    source: 'provider-native',
    sourcePath: ref.sourcePath,
    sourceMtimeMs: ref.sourceMtimeMs,
    nativeHistoryCoverage: 'full',
    workspace: ref.workspace,
  };
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

function antigravityConversationRoots() {
  return [
    path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversations'),
  ];
}

function antigravityCliRoot() {
  return path.join(os.homedir(), '.gemini', 'antigravity-cli');
}

function antigravityCliHistoryPath() {
  return path.join(antigravityCliRoot(), 'history.jsonl');
}

function antigravityBrainRoot() {
  return path.join(antigravityCliRoot(), 'brain');
}

function antigravityTranscriptLogPath(sessionId) {
  if (!isUuidLikeSessionId(sessionId)) return null;
  const logsRoot = resolvePathInside(antigravityBrainRoot(), sessionId, '.system_generated', 'logs');
  if (!logsRoot) return null;
  const candidates = ['transcript.jsonl', 'transcript_full.jsonl']
    .map((file) => resolvePathInside(logsRoot, file))
    .filter((filePath) => filePath && fs.existsSync(filePath));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => statMtimeMs(b) - statMtimeMs(a));
  return candidates[0];
}

function listAntigravityTranscriptLogs() {
  const root = antigravityBrainRoot();
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return []; }
  return entries
    .filter((entry) => entry.isDirectory() && isUuidLikeSessionId(entry.name))
    .map((entry) => {
      const sourcePath = antigravityTranscriptLogPath(entry.name);
      if (!sourcePath) return null;
      return { sessionId: entry.name, historySessionId: entry.name, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
    })
    .filter(Boolean);
}

function listAntigravityConversationFiles() {
  const files = [];
  for (const root of antigravityConversationRoots()) {
    files.push(...listFilesRecursive(root, (_entryPath, entry) => entry.isFile() && /^[0-9a-f-]+\.pb$/i.test(entry.name))
      .map((sourcePath) => {
        const sessionId = path.basename(sourcePath, '.pb');
        if (!isUuidLikeSessionId(sessionId)) return null;
        return { sessionId, historySessionId: sessionId, sourcePath, sourceMtimeMs: statMtimeMs(sourcePath) };
      })
      .filter(Boolean));
  }
  return files;
}

function readAntigravityCliHistoryRows() {
  const sourcePath = antigravityCliHistoryPath();
  let lines = [];
  try { lines = fs.readFileSync(sourcePath, 'utf-8').split('\n').filter(Boolean); } catch { return { sourcePath, sourceMtimeMs: 0, rows: [] }; }
  const rows = [];
  for (const line of lines) {
    let parsed = null;
    try { parsed = JSON.parse(line); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object') continue;
    const conversationId = normalizeHistorySessionId(parsed.conversationId);
    const display = typeof parsed.display === 'string' ? parsed.display.trim() : '';
    const workspace = typeof parsed.workspace === 'string' ? parsed.workspace.trim() : '';
    const receivedAt = extractTimestampValue(parsed.timestamp);
    if (!conversationId || !isUuidLikeSessionId(conversationId) || !display || !receivedAt) continue;
    rows.push({ conversationId, display, workspace, receivedAt });
  }
  return { sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), rows };
}

function readAntigravityCliPromptRows() {
  const sourcePath = antigravityCliHistoryPath();
  let lines = [];
  try { lines = fs.readFileSync(sourcePath, 'utf-8').split('\n').filter(Boolean); } catch { return { sourcePath, sourceMtimeMs: 0, rows: [] }; }
  const rows = [];
  for (const line of lines) {
    let parsed = null;
    try { parsed = JSON.parse(line); } catch { parsed = null; }
    if (!parsed || typeof parsed !== 'object') continue;
    const conversationId = normalizeHistorySessionId(parsed.conversationId);
    const display = typeof parsed.display === 'string' ? parsed.display.trim() : '';
    const workspace = typeof parsed.workspace === 'string' ? parsed.workspace.trim() : '';
    const receivedAt = extractTimestampValue(parsed.timestamp);
    if (!display || !receivedAt) continue;
    rows.push({
      conversationId: isUuidLikeSessionId(conversationId) ? conversationId : '',
      display,
      workspace,
      receivedAt,
    });
  }
  return { sourcePath, sourceMtimeMs: statMtimeMs(sourcePath), rows };
}

function antigravityRowsMatchWorkspace(rows, workspace) {
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) return rows;
  return rows.filter((row) => row.workspace && workspacePathsMatch(row.workspace, normalizedWorkspace));
}

function antigravityRowsMatchPrompt(rows, promptText) {
  const expected = String(promptText || '').replace(/\s+/g, ' ').trim();
  if (!expected) return rows;
  return rows.filter((row) => row.display.replace(/\s+/g, ' ').trim() === expected);
}

function extractAntigravityUserRequest(content) {
  const raw = String(content || '').trim();
  const match = raw.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (match) return match[1].trim();
  return raw
    .replace(/<ADDITIONAL_METADATA>[\s\S]*?<\/ADDITIONAL_METADATA>/gi, '')
    .replace(/<USER_SETTINGS_CHANGE>[\s\S]*?<\/USER_SETTINGS_CHANGE>/gi, '')
    .replace(/<\/?USER_REQUEST>/gi, '')
    .trim();
}

function normalizeAntigravityTranscriptContent(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.source === 'USER_EXPLICIT' && row.type === 'USER_INPUT') return extractAntigravityUserRequest(row.content);
  if (row.source !== 'MODEL') return '';
  if (typeof row.content !== 'string') return '';
  return row.content.trim();
}

function antigravityTranscriptKind(row) {
  const type = String(row?.type || '');
  if (type === 'PLANNER_RESPONSE') return 'standard';
  if (type && type !== 'USER_INPUT') return 'tool';
  return 'standard';
}

function readAntigravityTranscriptRows(ref, workspace) {
  if (!ref || !isUuidLikeSessionId(ref.sessionId) || !isPathInside(antigravityBrainRoot(), ref.sourcePath)) return null;
  let lines = [];
  try { lines = fs.readFileSync(ref.sourcePath, 'utf-8').split('\n').filter(Boolean); } catch { return null; }
  const records = [];
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  for (const line of lines) {
    let row = null;
    try { row = JSON.parse(line); } catch { row = null; }
    if (!row || typeof row !== 'object' || row.status !== 'DONE') continue;
    const content = normalizeAntigravityTranscriptContent(row);
    if (!content) continue;
    const receivedAt = extractTimestampValue(row.created_at) || (ref.sourceMtimeMs || Date.now()) + records.length;
    const common = {
      ts: new Date(receivedAt).toISOString(),
      receivedAt,
      content,
      agent: 'antigravity-cli',
      historySessionId: ref.sessionId,
      ...(normalizedWorkspace ? { workspace: normalizedWorkspace } : {}),
    };
    if (row.source === 'USER_EXPLICIT' && row.type === 'USER_INPUT') {
      records.push({ ...common, role: 'user', kind: 'standard' });
    } else if (row.source === 'MODEL') {
      const kind = antigravityTranscriptKind(row);
      records.push({
        ...common,
        role: 'assistant',
        kind,
        ...(kind === 'tool' ? { senderName: 'Tool' } : {}),
      });
    }
  }
  return records.length > 0 ? records : null;
}

function normalizeComparableText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function antigravityTranscriptUserPrompts(ref) {
  const records = readAntigravityTranscriptRows(ref, ref.workspace || '');
  if (!Array.isArray(records)) return [];
  return records
    .filter((message) => message && message.role === 'user')
    .map((message) => normalizeComparableText(message.content))
    .filter(Boolean);
}

function resolveAntigravityTranscriptByWorkspacePrompt(workspace, promptText) {
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) return null;
  let expectedPrompt = normalizeComparableText(promptText);
  let promptReceivedAt = 0;
  if (!expectedPrompt) {
    const history = readAntigravityCliPromptRows();
    const rows = antigravityRowsMatchWorkspace(history.rows, normalizedWorkspace)
      .sort((a, b) => a.receivedAt - b.receivedAt);
    const latest = rows[rows.length - 1];
    expectedPrompt = normalizeComparableText(latest?.display);
    promptReceivedAt = latest?.receivedAt || 0;
  }
  if (!expectedPrompt) return null;
  const candidates = listAntigravityTranscriptLogs()
    .filter((ref) => !promptReceivedAt || ref.sourceMtimeMs >= promptReceivedAt - 120_000)
    .sort((a, b) => b.sourceMtimeMs - a.sourceMtimeMs);
  for (const ref of candidates) {
    const prompts = antigravityTranscriptUserPrompts({ ...ref, workspace: normalizedWorkspace });
    if (prompts.includes(expectedPrompt)) {
      return { ...ref, workspace: normalizedWorkspace, rows: [], nativeHistoryCoverage: 'full' };
    }
  }
  return null;
}

// Antigravity writes the user prompt to history.jsonl immediately but the
// brain transcript.jsonl is written by the agent process and lags — sometimes
// by a few minutes while the model is thinking. v1 used a 1-second grace
// window which forced readChat to fall back to PTY for the whole "thinking"
// period, even though native was already authoritative for everything up to
// the latest prompt. The lag is observed up to ~3-5 minutes in practice, so
// we extend the grace window. After the grace window expires we trust the
// signal and reject the native read as stale (the user has likely typed a
// new prompt the agent hasn't received yet).
const ANTIGRAVITY_TRANSCRIPT_CATCHUP_GRACE_MS = 5 * 60_000;

function antigravityTranscriptIsMissingNewerPrompt(ref, workspace, transcriptMessages) {
  const sourceMtimeMs = Number(ref?.sourceMtimeMs || 0);
  if (!sourceMtimeMs || !Array.isArray(transcriptMessages)) return false;
  const normalizedWorkspace = typeof workspace === 'string' ? workspace.trim() : '';
  if (!normalizedWorkspace) return false;
  const transcriptPrompts = new Set(
    transcriptMessages
      .filter((message) => message && message.role === 'user')
      .map((message) => normalizeComparableText(message.content))
      .filter(Boolean),
  );
  const history = readAntigravityCliPromptRows();
  const now = Date.now();
  return history.rows
    // Only consider prompts that are *both* newer than the transcript file
    // AND older than the catchup grace window. A prompt within the grace
    // window is the in-flight one the agent is still processing — we keep
    // surfacing the native transcript as authoritative until it catches up.
    .filter((row) => row.receivedAt > sourceMtimeMs + 1000)
    .filter((row) => now - row.receivedAt > ANTIGRAVITY_TRANSCRIPT_CATCHUP_GRACE_MS)
    .filter((row) => row.workspace && workspacePathsMatch(row.workspace, normalizedWorkspace))
    .some((row) => {
      const prompt = normalizeComparableText(row.display);
      if (!prompt || transcriptPrompts.has(prompt)) return false;
      // (fix) Skip system-generated structured-input file path prompts. The daemon
      // writes a temp file like /var/folders/.../adhdev-input-*.txt and types
      // that path into the CLI for image/text combos. Antigravity's brain unwraps
      // the file contents into transcript so the literal path never appears as
      // a USER_INPUT row. Treating it as a "missing newer prompt" tears down the
      // native read for a prompt that is actually present in another form.
      if (looksLikeStructuredInputFilePath(prompt)) return false;
      // (fix) If the unseen prompt belongs to THIS session (conversationId
      // matches ref.sessionId), it belongs to the same conversation. Trust the
      // native transcript as the authoritative partial view — the agent simply
      // hasn't echoed the prompt yet (or it's an unwrapped structured input).
      // We only treat the transcript as stale for *foreign* unseen prompts.
      if (row.conversationId && row.conversationId === ref.sessionId) return false;
      return !row.conversationId;
    });
}

function looksLikeStructuredInputFilePath(text) {
  if (!text || typeof text !== 'string') return false;
  // Daemon materializes structured input to a temp file under the OS tmpdir
  // and types its absolute path. Match the well-known prefixes/suffixes.
  return /(?:^|\s)\/(?:var|tmp|private)\/[^\s]*adhdev-input[^\s]*\.(?:txt|md|json)(?:\s|$)/.test(text)
    || /(?:^|\s)\/(?:var|tmp|private)\/[^\s]+\.(?:adhdev-input|adhdev-prompt)(?:\s|$)/.test(text);
}

function resolveAntigravityConversation(sessionId, workspace, promptText) {
  const normalized = normalizeHistorySessionId(sessionId);
  if (normalized && !isUuidLikeSessionId(normalized)) return null;
  const history = readAntigravityCliHistoryRows();
  let rows = history.rows;
  if (normalized) rows = rows.filter((row) => row.conversationId === normalized);
  rows = antigravityRowsMatchWorkspace(rows, workspace);
  rows = antigravityRowsMatchPrompt(rows, promptText);
  if (rows.length === 0) {
    if (normalized) {
      const transcriptPath = antigravityTranscriptLogPath(normalized);
      if (transcriptPath) {
        return {
          sessionId: normalized,
          historySessionId: normalized,
          sourcePath: transcriptPath,
          sourceMtimeMs: statMtimeMs(transcriptPath),
          rows: [],
          workspace,
          nativeHistoryCoverage: 'full',
        };
      }
      const pbPath = antigravityConversationRoots()
        .map((root) => resolvePathInside(root, `${normalized}.pb`))
        .find((candidate) => candidate && fs.existsSync(candidate));
      if (pbPath) {
        return {
          sessionId: normalized,
          historySessionId: normalized,
          sourcePath: pbPath,
          sourceMtimeMs: statMtimeMs(pbPath),
          rows: [],
          unavailableReason: 'opaque_antigravity_protobuf_without_stable_schema',
        };
      }
    }
    // (fix) Workspace+prompt fallback was returning a different conversation's
    // transcript when the new session's own prompt happened to match an old
    // session that recorded the same words. Only do the workspace fallback
    // when no sessionId was supplied at all — when the caller declared a
    // sessionId we must not surface a foreign conversation's history.
    if (!normalized) {
      return resolveAntigravityTranscriptByWorkspacePrompt(workspace, promptText);
    }
    return null;
  }
  rows.sort((a, b) => a.receivedAt - b.receivedAt);
  const latest = rows[rows.length - 1];
  const sessionRows = history.rows
    .filter((row) => row.conversationId === latest.conversationId)
    .filter((row) => !workspace || !row.workspace || workspacePathsMatch(row.workspace, workspace))
    .sort((a, b) => a.receivedAt - b.receivedAt);
  const transcriptPath = antigravityTranscriptLogPath(latest.conversationId);
  if (transcriptPath) {
    return {
      sessionId: latest.conversationId,
      historySessionId: latest.conversationId,
      sourcePath: transcriptPath,
      sourceMtimeMs: statMtimeMs(transcriptPath),
      rows: sessionRows,
      workspace: latest.workspace,
      nativeHistoryCoverage: 'full',
    };
  }
  return {
    sessionId: latest.conversationId,
    historySessionId: latest.conversationId,
    sourcePath: history.sourcePath,
    sourceMtimeMs: history.sourceMtimeMs,
    rows: sessionRows,
    workspace: latest.workspace,
  };
}

function readAntigravityNativeHistory(input = {}) {
  const sessionId = input.historySessionId || input.sessionId || input.args?.historySessionId || input.args?.sessionId;
  const workspace = input.workspace || input.args?.workspace;
  const promptText = input.promptText || input.expectedPrompt || input.args?.promptText || input.args?.expectedPrompt;
  const spawnAt = Number(input.spawnAt) || 0;
  const ref = resolveAntigravityConversation(sessionId, workspace, promptText);
  if (!ref || ref.unavailableReason) return null;
  // (fix) Same pre-spawn-rollout guard as codex: if the only thing we found
  // by workspace fallback is older than the current process, that's the
  // PREVIOUS conversation's transcript and we must not stamp its UUID onto
  // the brand-new adapter.
  if (spawnAt > 0 && !sessionId && ref.sourceMtimeMs && ref.sourceMtimeMs < spawnAt - 3000) return null;
  if (ref.nativeHistoryCoverage === 'full') {
    const transcriptWorkspace = workspace || ref.workspace;
    const transcriptMessages = readAntigravityTranscriptRows(ref, transcriptWorkspace);
    if (transcriptMessages) {
      if (antigravityTranscriptIsMissingNewerPrompt(ref, transcriptWorkspace, transcriptMessages)) return null;
      return {
        messages: transcriptMessages,
        providerSessionId: ref.sessionId,
        source: 'provider-native',
        sourcePath: ref.sourcePath,
        sourceMtimeMs: ref.sourceMtimeMs,
        nativeHistoryCoverage: 'full',
      };
    }
  }
  if (!Array.isArray(ref.rows) || ref.rows.length === 0) return null;
  const records = [];
  const firstWorkspace = ref.workspace || ref.rows.find((row) => row.workspace)?.workspace || '';
  if (firstWorkspace) {
    const firstTs = ref.rows[0].receivedAt;
    records.push({ ts: new Date(firstTs).toISOString(), receivedAt: firstTs, role: 'system', kind: 'session_start', content: firstWorkspace, agent: 'antigravity-cli', historySessionId: ref.sessionId, workspace: firstWorkspace });
  }
  for (const row of ref.rows) {
    records.push({
      ts: new Date(row.receivedAt).toISOString(),
      receivedAt: row.receivedAt,
      role: 'user',
      content: row.display,
      kind: 'standard',
      agent: 'antigravity-cli',
      historySessionId: ref.sessionId,
      ...(row.workspace ? { workspace: row.workspace } : {}),
    });
  }
  return {
    messages: records,
    providerSessionId: ref.sessionId,
    sourcePath: ref.sourcePath,
    sourceMtimeMs: ref.sourceMtimeMs,
    nativeHistoryCoverage: 'partial',
    partialReason: 'antigravity_cli_history_jsonl_contains_user_prompts_only',
    unavailableReason: 'opaque_antigravity_protobuf_without_stable_schema',
  };
}

function buildAntigravityCliJsonlSummaries() {
  const history = readAntigravityCliHistoryRows();
  const grouped = new Map();
  for (const row of history.rows) {
    const existing = grouped.get(row.conversationId) || {
      historySessionId: row.conversationId,
      sessionId: row.conversationId,
      sessionTitle: undefined,
      messageCount: 0,
      firstMessageAt: row.receivedAt,
      lastMessageAt: row.receivedAt,
      preview: undefined,
      workspace: row.workspace || undefined,
      source: 'provider-native',
      sourcePath: history.sourcePath,
      sourceMtimeMs: history.sourceMtimeMs,
      agent: 'antigravity-cli',
      nativeHistoryCoverage: 'partial',
      partialReason: 'antigravity_cli_history_jsonl_contains_user_prompts_only',
      unavailableReason: 'opaque_antigravity_protobuf_without_stable_schema',
    };
    existing.messageCount += 1;
    existing.firstMessageAt = Math.min(existing.firstMessageAt || row.receivedAt, row.receivedAt);
    if (row.receivedAt >= (existing.lastMessageAt || 0)) {
      existing.lastMessageAt = row.receivedAt;
      existing.sessionTitle = row.display;
      existing.preview = row.display;
      if (row.workspace) existing.workspace = row.workspace;
    }
    grouped.set(row.conversationId, existing);
  }
  return Array.from(grouped.values());
}

function listAntigravityNativeHistory() {
  const sessions = [];
  const seen = new Set();
  const historySummaries = buildAntigravityCliJsonlSummaries();
  const workspaceBySession = new Map(historySummaries.map((summary) => [summary.historySessionId, summary.workspace]));
  for (const ref of listAntigravityTranscriptLogs()) {
    const messages = readAntigravityTranscriptRows(ref, workspaceBySession.get(ref.historySessionId)) || [];
    const summary = buildSummary('antigravity-cli', { ...ref, workspace: workspaceBySession.get(ref.historySessionId) }, messages);
    if (!summary) continue;
    summary.nativeHistoryCoverage = 'full';
    sessions.push(summary);
    seen.add(summary.historySessionId);
  }
  for (const summary of historySummaries) {
    if (seen.has(summary.historySessionId)) continue;
    sessions.push(summary);
    seen.add(summary.historySessionId);
  }
  for (const ref of listAntigravityConversationFiles()) {
    if (seen.has(ref.historySessionId || ref.sessionId)) continue;
    sessions.push({
      historySessionId: ref.historySessionId || ref.sessionId,
      sessionId: ref.sessionId,
      sessionTitle: undefined,
      messageCount: 0,
      firstMessageAt: ref.sourceMtimeMs || Date.now(),
      lastMessageAt: ref.sourceMtimeMs || Date.now(),
      preview: undefined,
      source: 'provider-native',
      sourcePath: ref.sourcePath,
      sourceMtimeMs: ref.sourceMtimeMs || 0,
      agent: 'antigravity-cli',
      nativeHistoryCoverage: 'unavailable',
      unavailableReason: 'opaque_antigravity_protobuf_without_stable_schema',
    });
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

// ───────────────────────────────────────────────────────────────
//  Chat transcript v2 identity stamping (A2.3)
//
//  Wraps each provider's readNativeHistory return value to attach stable
//  providerUnitKey / bubbleId / sequence to every message. v1 producers
//  did not emit these and the daemon was forced to re-synthesise them
//  from index+content hash on every read (the four-different-ID-shapes
//  problem from the chat refactor audit). v2 emits identity once at the
//  producer, stable across re-reads.
//
//  Sequence semantics:
//    - sequence is a monotonic non-negative integer per (provider, session).
//    - Producers cannot in general supply a session-wide monotonic counter
//      from a single read, so we derive it from the natural timestamp
//      ordering present in the source (claude jsonl ts, codex session_meta,
//      hermes session record). When the source has no usable timestamp we
//      fall back to positional index — stable across reads of the same
//      file but resets on file truncation, which is acceptable because a
//      truncation is itself a regression event the daemon's
//      ChatSourceMachine will detect.
//
//  providerUnitKey semantics:
//    - Stable across re-reads of the same logical message.
//    - For claude: derived from the message uuid the JSONL carries.
//    - For codex: derived from the response_id + position.
//    - For hermes: derived from the session record's stable msg key.
//    - For antigravity: derived from the jsonl record's response_id.
//    - Fallback (any producer not supplying a native id): a SHA1 of
//      (providerType, sessionId, role, content) which is stable across
//      reads of the same content but not across edits. Tested by the
//      daemon's ChatSourceMachine — content edits are a regression event
//      and unlock the source decision.
// ───────────────────────────────────────────────────────────────

function v2StampMessages(providerType, sessionId, messages) {
  if (!Array.isArray(messages)) return messages;
  const out = new Array(messages.length);
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (!message || typeof message !== 'object') {
      out[i] = message;
      continue;
    }
    const existingProviderUnitKey = typeof message.providerUnitKey === 'string' && message.providerUnitKey
      ? message.providerUnitKey
      : null;
    const existingBubbleId = typeof message.bubbleId === 'string' && message.bubbleId
      ? message.bubbleId
      : null;
    const existingSequence = typeof message.sequence === 'number' && Number.isFinite(message.sequence)
      ? message.sequence
      : null;
    const tsCandidate = Number(message.receivedAt || message.timestamp || message.ts || 0);
    const sequence = existingSequence !== null
      ? existingSequence
      : (tsCandidate > 0 ? tsCandidate : i);
    const role = typeof message.role === 'string' ? message.role : '';
    const kind = typeof message.kind === 'string' ? message.kind : 'standard';
    const contentForKey = typeof message.content === 'string'
      ? message.content
      : (Array.isArray(message.content) ? JSON.stringify(message.content) : '');
    const providerUnitKey = existingProviderUnitKey
      || `v2:${providerType}:${sessionId || 'workspace'}:${i}:${role}:${kind}:${stableHash([providerType, sessionId || '', role, kind, contentForKey].join(''))}`;
    const bubbleId = existingBubbleId || `bubble:${providerUnitKey}`;
    out[i] = {
      ...message,
      providerUnitKey,
      bubbleId,
      sequence,
    };
  }
  return out;
}

function v2StampResult(providerType, fnName, result) {
  if (!result || typeof result !== 'object') return result;
  const sessionId = typeof result.providerSessionId === 'string' ? result.providerSessionId : '';
  return {
    ...result,
    messages: v2StampMessages(providerType, sessionId, result.messages),
  };
}

function wrapReadV2(providerType, fn) {
  return function readWrapped(input) {
    const result = fn(input);
    if (result === null || result === undefined) return result;
    return v2StampResult(providerType, fn.name, result);
  };
}

module.exports = {
  readHermesNativeHistory: wrapReadV2('hermes-cli', readHermesNativeHistory),
  listHermesNativeHistory,
  readClaudeNativeHistory: wrapReadV2('claude-cli', readClaudeNativeHistory),
  listClaudeNativeHistory,
  readCodexNativeHistory: wrapReadV2('codex-cli', readCodexNativeHistory),
  listCodexNativeHistory,
  readAntigravityNativeHistory: wrapReadV2('antigravity-cli', readAntigravityNativeHistory),
  listAntigravityNativeHistory,
  workspacePathsMatch,
  __clearCodexNativeHistoryCaches: clearCodexNativeHistoryCaches,
  __getCodexNativeHistoryCacheStats: getCodexNativeHistoryCacheStats,
  __v2StampMessages: v2StampMessages, // exported for unit tests
};
