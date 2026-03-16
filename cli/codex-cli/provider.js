/**
 * Codex CLI — CLI Provider
 * 
 * Category: cli (PTY 기반 — node-pty로 codex 프로세스 관리)
 * 
 * OpenAI Codex CLI — 비교적 단순한 TUI.
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'codex-cli',
  name: 'Codex CLI',
  category: 'cli',
  aliases: ['codex'],
  icon: '🧠',
  displayName: 'Codex CLI',

  settings: {
    mode: {
      type: 'select', default: 'terminal', public: true,
      label: '표시 모드', options: ['terminal', 'chat'],
    },
    notifications: {
      type: 'boolean', default: true, public: true,
      label: '알림',
    },
  },

  // ─── CLI 실행 설정 ───
  binary: 'codex',
  spawn: {
    command: 'codex',
    args: ['--full-auto'],
    shell: false,
    env: {},
  },

  // ─── PTY 출력 패턴 매칭 ───
  patterns: {
    prompt: [
      /[❯>]\s*$/,
      /codex\s*>\s*$/m,
      /\$\s*$/m,
    ],
    generating: [
      /generating/i,
      /thinking/i,
      /esc\s+to\s+(interrupt|cancel)/i,
    ],
    approval: [
      /\(y\)es\s*\/\s*\(n\)o/i,
      /\[y\/n\]/i,
      /do\s+you\s+want\s+to\s+(run|proceed|allow|execute)/i,
      /proceed\?/i,
      /approve/i,
    ],
    ready: [
      /[❯>]\s*$/,
      /codex\s*>\s*$/m,
    ],
  },

  /**
   * Codex CLI 출력 정리 — 프롬프트, 상태바 제거
   */
  cleanOutput(raw, _lastUserInput) {
    const lines = raw.split('\n');
    const cleaned = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) { cleaned.push(''); continue; }
      if (/^[❯>]\s*$/.test(t)) continue;
      if (/^codex\s*>/.test(t)) continue;
      if (/^\$\s*$/.test(t)) continue;
      if (/^[\u2500\u2501\u2550]{4,}/.test(t)) continue;
      cleaned.push(line);
    }
    return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },
};
