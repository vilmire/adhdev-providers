'use strict';

const ANSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const REASONING_LEVELS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

function stripAnsi(text) {
  return String(text || '').replace(ANSI_RE, '').replace(/\u0007/g, '');
}

function normalizeLine(line) {
  return stripAnsi(line)
    .replace(/[│╭╮╰╯]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitNormalizedLines(text) {
  return stripAnsi(text).split(/\r?\n/).map(normalizeLine).filter(Boolean);
}

function normalizeReasoning(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[-_\s]+/g, '');
  if (normalized === 'max' || normalized === 'extra' || normalized === 'extrahigh') return 'xhigh';
  return REASONING_LEVELS.has(normalized) ? normalized : '';
}

function parseModelReasoningFastFromLine(line) {
  const value = normalizeLine(line);
  if (!value) return null;

  const header = value.match(/\bmodel:\s*([a-z0-9][a-z0-9._-]*)(?:\s+(none|minimal|low|medium|high|xhigh|max|extra\s+high))?(?:\s+(fast))?\s+\/model\b/i);
  if (header) {
    return {
      model: header[1],
      reasoning: normalizeReasoning(header[2]),
      fast: !!header[3],
    };
  }

  const footer = value.match(/(?:^|[›❯>]\s*)\b([a-z0-9][a-z0-9._-]*)(?:\s+(none|minimal|low|medium|high|xhigh|max|extra\s+high))?(?:\s+(fast))?\s+·/i);
  if (footer && /^gpt-|^o\d\b|^codex/i.test(footer[1])) {
    return {
      model: footer[1],
      reasoning: normalizeReasoning(footer[2]),
      fast: !!footer[3],
    };
  }

  return null;
}

function extractControlValues(...sources) {
  const text = sources.map(source => String(source || '')).filter(Boolean).join('\n');
  const lines = splitNormalizedLines(text);
  const values = {};

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const parsed = parseModelReasoningFastFromLine(lines[i]);
    if (!parsed) continue;
    if (parsed.model && values.model === undefined) values.model = parsed.model;
    if (parsed.reasoning && values.reasoning === undefined) values.reasoning = parsed.reasoning;
    if (parsed.fast !== undefined && values.fast === undefined) values.fast = parsed.fast;
    if (values.model !== undefined && values.reasoning !== undefined && values.fast !== undefined) break;
  }

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const fastStatus = lines[i].match(/\bFast mode (?:is|set to)\s+(on|off)\b/i);
    if (fastStatus) {
      values.fast = fastStatus[1].toLowerCase() === 'on';
      break;
    }
  }

  return Object.keys(values).length > 0 ? values : undefined;
}

function extractCurrentModel(text) {
  return extractControlValues(text)?.model || '';
}

function extractJsonObject(text) {
  const raw = String(text || '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function formatModelDescription(model) {
  const parts = [];
  if (model.default_reasoning_level) parts.push(`default: ${model.default_reasoning_level}`);
  const reasoning = Array.isArray(model.supported_reasoning_levels)
    ? model.supported_reasoning_levels
      .map(item => normalizeReasoning(item?.effort || item))
      .filter(Boolean)
    : [];
  if (reasoning.length > 0) parts.push(`reasoning: ${reasoning.join('/')}`);
  const speedTiers = Array.isArray(model.additional_speed_tiers)
    ? model.additional_speed_tiers.map(String).filter(Boolean)
    : [];
  if (speedTiers.includes('fast')) parts.push('fast');
  return parts.join(' · ') || String(model.description || '').trim();
}

function modelsFromDebugOutput(output) {
  const parsed = extractJsonObject(output);
  const models = Array.isArray(parsed?.models) ? parsed.models : [];
  return models
    .filter(model => model && typeof model.slug === 'string' && model.slug.trim())
    .filter(model => model.visibility !== 'hidden')
    .map(model => ({
      value: model.slug.trim(),
      label: String(model.display_name || model.slug).trim(),
      ...(formatModelDescription(model) ? { description: formatModelDescription(model) } : {}),
    }));
}

module.exports = {
  extractControlValues,
  extractCurrentModel,
  modelsFromDebugOutput,
  normalizeReasoning,
};
