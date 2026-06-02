'use strict';

function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b[>=]/g, '')
    .replace(/\u0007/g, '');
}

function splitLines(text) {
  return stripAnsi(text)
    .split(/\r\n|\n|\r/g)
    .map((line) => line.replace(/^\d+;/, '').replace(/\s+$/, ''));
}

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function sourceText(input) {
  const candidates = [input?.screenText, input?.recentBuffer, input?.buffer, input?.tail];
  for (const value of candidates) {
    const text = String(value || '');
    if (stripAnsi(text).trim()) return text;
  }
  return '';
}

function numberedOption(line) {
  const match = normalize(line).match(/^>?\s*(\d+)\.\s+(.+)$/);
  return match ? match[2].trim() : null;
}

function yesNoOption(line) {
  const match = normalize(line).match(/^>?\s*((?:yes|no)\b.*)$/i);
  return match ? match[1].trim() : null;
}

function inlineBracketOptions(line) {
  const text = normalize(line);
  const options = [];
  const pattern = /\[\d+\]\s+([^\[]+?)(?=\s+\[\d+\]\s+|$)/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const label = normalize(match[1]);
    if (label) options.push(label);
  }
  return options;
}

function visibleOptionLabels(line) {
  const inline = inlineBracketOptions(line);
  if (inline.length > 0) return inline;
  const numbered = numberedOption(line);
  if (numbered) return [numbered];
  const yesNo = yesNoOption(line);
  return yesNo ? [yesNo] : [];
}

function footerOrPrompt(line) {
  const text = normalize(line);
  return !text
    || text === '>'
    || /^\?\s+for\s+shortcuts$/i.test(text)
    || /↑\/↓\s+navigate/i.test(text)
    || /esc to cancel/i.test(text);
}

function isContinuationLine(text) {
  // A wrapped button label continuation: indented, no numbered prefix, not a
  // new question/footer/section header. Antigravity wraps long option labels
  // ("Yes, and always allow in this conversation for commands that start
  //  with ...") onto the next line, indented to align with the label text.
  if (!text) return false;
  if (footerOrPrompt(text)) return false;
  if (/^>?\s*\d+\.\s/.test(text)) return false;
  if (/^>\s*$/.test(text)) return false;
  if (/\?$/.test(text)) return false;
  if (/^(agy wants to run|file access|write|read|edit|delete|reason)[:.]/i.test(text)) return false;
  return true;
}

function collectVisibleOptions(lines, startIndex) {
  const options = [];
  let blankRunSinceLastOption = 0;
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const text = normalize(lines[i]);
    if (!text) {
      // Tolerate a single blank line between numbered options — Antigravity
      // sometimes pads between long options. Two consecutive blanks ends the
      // option list.
      if (options.length > 0 && ++blankRunSinceLastOption >= 2) break;
      continue;
    }
    if (footerOrPrompt(text)) break;
    const labels = visibleOptionLabels(text);
    if (labels.length > 0) {
      blankRunSinceLastOption = 0;
      for (const label of labels) {
        if (!options.includes(label)) options.push(label);
      }
      continue;
    }
    // Wrap continuation of the previous option's label.
    if (options.length > 0 && isContinuationLine(text)) {
      blankRunSinceLastOption = 0;
      const last = options[options.length - 1];
      options[options.length - 1] = `${last} ${text}`.trim();
      continue;
    }
    if (options.length > 0) break;
  }
  return options;
}

function buildGenericApproval(lines) {
  for (let questionIndex = lines.length - 1; questionIndex >= 0; questionIndex -= 1) {
    const question = normalize(lines[questionIndex]);
    if (!question || footerOrPrompt(question) || !/\?$/.test(question)) continue;

    const buttons = [];
    let blanks = 0;
    for (let i = questionIndex + 1; i < lines.length; i += 1) {
      const text = normalize(lines[i]);
      if (!text) {
        if (buttons.length > 0 && ++blanks >= 2) break;
        continue;
      }
      const labels = visibleOptionLabels(lines[i]);
      if (labels.length > 0) {
        blanks = 0;
        for (const label of labels) {
          if (!buttons.includes(label)) buttons.push(label);
        }
        continue;
      }
      if (buttons.length > 0 && footerOrPrompt(text)) break;
      if (buttons.length > 0 && isContinuationLine(text)) {
        blanks = 0;
        const last = buttons[buttons.length - 1];
        buttons[buttons.length - 1] = `${last} ${text}`.trim();
        continue;
      }
      if (buttons.length > 0) break;
    }
    if (buttons.length < 2) continue;

    const context = [];
    for (let i = Math.max(0, questionIndex - 6); i < questionIndex; i += 1) {
      const text = normalize(lines[i]);
      if (!text || footerOrPrompt(text) || visibleOptionLabels(text).length > 0) continue;
      if (/^agy wants to run:/i.test(text) || /^file access$/i.test(text) || /^(write|read|edit|delete):/i.test(text) || /^reason:/i.test(text)) {
        context.push(text);
      }
    }

    const message = context.length > 0 ? `${context.join(' ')} ${question}` : question;
    return { message, buttons };
  }
  return null;
}

module.exports = function parseApproval(input) {
  const screenText = sourceText(input);
  const lines = splitLines(screenText);
  const normalized = lines.map(normalize).filter(Boolean);
  if (normalized.length === 0) return null;

  const trustIndex = normalized.findIndex((line) => /do you trust the files in this folder\?/i.test(line));
  if (trustIndex >= 0) {
    const lineIndex = lines.findIndex((line) => /do you trust the files in this folder\?/i.test(normalize(line)));
    const buttons = collectVisibleOptions(lines, lineIndex >= 0 ? lineIndex : 0);
    if (buttons.length < 2) return null;
    return {
      message: 'Do you trust the files in this folder?',
      buttons,
    };
  }

  const trustProjectIndex = normalized.findIndex((line) => /do you trust the contents of this project\?/i.test(line));
  if (trustProjectIndex >= 0) {
    const lineIndex = lines.findIndex((line) => /do you trust the contents of this project\?/i.test(normalize(line)));
    const buttons = collectVisibleOptions(lines, lineIndex >= 0 ? lineIndex : 0);
    if (buttons.length >= 2) {
      return {
        message: 'Do you trust the contents of this project?',
        buttons,
      };
    }
  }

  const proceedIndex = normalized.findIndex((line) => /do you want to proceed\?/i.test(line));
  if (proceedIndex >= 0) {
    const lineIndex = lines.findIndex((line) => /do you want to proceed\?/i.test(normalize(line)));
    const buttons = collectVisibleOptions(lines, lineIndex >= 0 ? lineIndex : 0);
    if (buttons.length < 2) return null;
    const start = lines.findIndex((line) => /wants to run:/i.test(normalize(line)));
    const commandLines = [];
    if (start >= 0) {
      for (let i = start + 1; i < lines.length; i += 1) {
        const text = normalize(lines[i]);
        if (!text || footerOrPrompt(text) || visibleOptionLabels(text).length > 0 || /do you want to proceed\?/i.test(text)) break;
        commandLines.push(text);
      }
    }
    const message = commandLines.length > 0
      ? `Do you want to proceed? ${commandLines.join(' ')}`.trim()
      : 'Do you want to proceed?';
    return {
      message,
      buttons,
    };
  }

  // (fix) Do NOT fall back to buildGenericApproval here. AGY assistant answers
  // routinely include numbered lists ending with "?" — buildGenericApproval
  // misclassified those as approval modals, which made the state engine spin
  // generating → waiting_approval → generating for the entire reply duration
  // and pushed a "Approval requested" system message into the runtime chat
  // every time. AGY's real approval prompts always use one of the explicit
  // strings handled above (trust folder, trust project, do you want to
  // proceed); no need for a generic fallback.
  return null;
};
