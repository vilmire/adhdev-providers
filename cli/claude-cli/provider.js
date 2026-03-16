/**
 * Claude Code — CLI Provider
 * 
 * Category: cli (PTY 기반 — node-pty로 claude 프로세스 관리)
 * 
 * Claude Code는 ⏺/⎿ 프리픽스로 응답 구조를 표시.
 * TerminalBuffer를 사용하여 스크린 콘텐츠를 읽음.
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'claude-cli',
  name: 'Claude Code',
  category: 'cli',
  aliases: ['claude', 'claude-code'],
  icon: '🤖',
  displayName: 'Claude Code',

  // ─── Provider Settings (대시보드에서 제어 가능) ───
  settings: {
    mode: {
      type: 'select',
      default: 'terminal',
      public: true,
      label: '표시 모드',
      description: 'terminal: PTY 터미널 뷰, chat: 파싱된 대화 뷰',
      options: ['terminal', 'chat'],
    },
    notifications: {
      type: 'boolean',
      default: true,
      public: true,
      label: '알림',
      description: '상태 변경 시 알림을 표시합니다',
    },
    autoApprove: {
      type: 'boolean',
      default: false,
      public: true,
      label: '자동 승인',
      description: '도구 실행 승인을 자동으로 허용합니다',
    },
  },

  // ─── CLI 실행 설정 ───
  binary: 'claude',
  spawn: {
    command: 'claude',
    args: [],
    shell: false,
    env: {},
  },

  // ─── PTY 출력 패턴 매칭 ───
  patterns: {
    prompt: [
      /❯\s*$/m,
      /[a-zA-Z0-9._-]+\s*>\s*$/m,
      /claude\s*>\s*$/m,
      /➜\s+.*\s*$/m,
      /\s+✗\s*$/m,
      /\?\s*for\s*shortcuts/i,
      /effort/i,
    ],
    generating: [
      /esc\s+to\s+interrupt/i,
      /⎋\s*to\s+interrupt/i,
      /press\s+esc\s+to\s+interrupt/i,
      /accept\s+edits\s+on/i,
      /shift\+tab\s+to\s+cycle/i,
    ],
    approval: [
      /allow\s+once/i,
      /always\s+allow/i,
      /\(y\)es\s*\/\s*\(n\)o/i,
      /\[y\/n\/a\]/i,
      /do\s+you\s+want\s+to\s+(run|proceed|allow|execute|make|create|delete|write|edit)/i,
      /proceed\?/i,
      /esc\s+to\s+cancel/i,
      /tab\s+to\s+amend/i,
      /yes,\s+allow\s+all\s+edits/i,
    ],
    ready: [
      /❯\s*$/m,
      /\?\s*for\s*shortcuts/i,
    ],
  },

  /**
   * Claude Code TUI 아티팩트 제거
   * ⏺ 프리픽스 응답 본문 추출, TUI 크롬 제거
   */
  cleanOutput(raw, _lastUserInput) {
    const allSegments = [];
    for (const line of raw.split('\n')) {
      const segs = line.split('\r').map(s => s.trim()).filter(Boolean);
      allSegments.push(...segs);
    }

    const responseLines = [];
    let foundResponse = false;
    for (const seg of allSegments) {
      if (seg.startsWith('⏺')) {
        foundResponse = true;
        responseLines.push(seg.replace(/^⏺\s*/, ''));
        continue;
      }
      if (seg.startsWith('⎿')) {
        if (foundResponse) responseLines.push(seg.replace(/^⎿\s*/, ''));
        continue;
      }
      if (foundResponse) {
        const s = seg.trim();
        // TUI junk
        if (/^❯/.test(s)) continue;
        if (/^\?\s*for\s*shortcuts/.test(s)) continue;
        if (/^[╭╰│├╮╯─═]+$/.test(s)) continue;
        if (/^◐\s/.test(s) || /\/effort/.test(s)) continue;
        if (/esc\s*to\s*interrupt/i.test(s)) continue;
        if (/^0;/.test(s)) continue;
        if (/^[✻✶✳✢✽·◆◇◐◑◒◓⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(s) && s.length < 40) continue;
        responseLines.push(seg);
      }
    }

    return responseLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },
};
