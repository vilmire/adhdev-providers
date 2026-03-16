/**
 * Gemini CLI — CLI Provider
 * 
 * Category: cli (PTY 기반 — node-pty로 gemini 프로세스 관리)
 * 
 * Gemini CLI는 INK/React TUI를 사용하여 터미널에 렌더링.
 * 출력에 박스 문자, 구분선, 상태바 등 TUI 아티팩트가 포함됨.
 * cleanOutput()에서 이를 제거하여 순수 응답만 추출.
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'gemini-cli',
  name: 'Gemini CLI',
  category: 'cli',
  aliases: ['gemini'],
  icon: '♊',
  displayName: 'Gemini CLI',

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
  binary: 'gemini',
  spawn: {
    command: 'gemini',
    args: ['--yolo'],
    shell: true,
    env: {},
  },

  // ─── PTY 출력 패턴 매칭 ───
  patterns: {
    prompt: [
      /Type your message/,
      /[❯>]\s*$/,
      /\n\s*[❯>]\s*$/,
    ],
    generating: [
      /esc\s+to\s+interrupt/i,
      /⎋\s*to\s+interrupt/i,
      /press\s+esc\s+to\s+interrupt/i,
      /accept\s+edits\s+on/i,
      /shift\+tab\s+to\s+cycle/i,
      /ctrl\+c\s+to\s+(cancel|interrupt|stop)/i,
    ],
    approval: [
      /allow\s+once/i,
      /always\s+allow/i,
      /\(y\)es\s*\/\s*\(n\)o/i,
      /\[y\/n\/a\]/i,
      /do\s+you\s+want\s+to\s+(run|proceed|allow|execute)/i,
      /proceed\?/i,
    ],
    ready: [
      /[❯>]\s*$/,
      /Gemini \d/i,
    ],
  },

  /**
   * Gemini CLI TUI 아티팩트 제거 — AI 응답 본문만 추출
   * INK/React TUI의 박스 문자, 구분선, 상태바, 프롬프트 등을 제거
   */
  cleanOutput(raw, lastUserInput) {
    const lines = raw.split('\n');
    const cleaned = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { cleaned.push(''); continue; }

      // 박스 문자 줄
      if (/^[\u256d\u256e\u2570\u256f\u2502\u251c\u2524\u252c\u2534\u253c\u2500\u2501\u2550\u2554\u2557\u255a\u255d\u2551]+$/.test(trimmed)) continue;
      if (/^[\u256d\u2570]\u2500\u2500/.test(trimmed) || /\u2500\u2500[\u256e\u256f]$/.test(trimmed)) continue;
      if (/^\u2502.*\u2502$/.test(trimmed)) continue;

      // 구분선
      if (/[\u2500\u2501\u2550\u2580\u2584]{4,}/.test(trimmed)) continue;

      // 상태바/메타
      if (/^YOLO\s+ctrl\+y/i.test(trimmed)) continue;
      if (/^\? for shortcuts/.test(trimmed)) continue;
      if (/^\/model\s/i.test(trimmed)) continue;
      if (/^~\s.*no sandbox/i.test(trimmed)) continue;
      if (/^Type your message/i.test(trimmed)) continue;
      if (/ctrl\+[a-z]/i.test(trimmed) && trimmed.length < 50) continue;

      // 단축키 도움말
      if (/Shortcuts?\s*\(for more/i.test(trimmed)) continue;
      if (/shell mode|cycle mode|paste images|select file or folder/i.test(trimmed)) continue;

      // 프롬프트 줄
      if (/^[❯>]\s*$/.test(trimmed)) continue;
      if (/^[*•]\s*$/.test(trimmed)) continue;

      // 사용자 입력 에코
      if (lastUserInput && /^[*•]\s/.test(trimmed)) {
        const bulletContent = trimmed.replace(/^[*•]\s*/, '').trim();
        if (bulletContent === lastUserInput.trim()) continue;
      }

      // 업데이트/인증 안내
      if (/Gemini CLI update available/i.test(trimmed)) continue;
      if (/brew upgrade gemini-cli/i.test(trimmed)) continue;
      if (/Waiting for auth/i.test(trimmed)) continue;

      // 스피너 문자만 있는 줄
      if (/^[\u280b\u2819\u2839\u2838\u283c\u2834\u2826\u2827\u2807\u280f\s]+$/.test(trimmed)) continue;

      cleaned.push(line);
    }

    return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  },
};
