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

function footerOrPrompt(line) {
  const text = normalize(line);
  return !text
    || text === '>'
    || /^\?\s+for\s+shortcuts$/i.test(text)
    || /↑\/↓\s+navigate/i.test(text)
    || /esc to cancel/i.test(text);
}

function findOptionIndexes(lines) {
  const indexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (numberedOption(lines[i])) indexes.push(i);
  }
  return indexes;
}

function collectYesNoOptions(lines, startIndex) {
  const options = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const text = normalize(lines[i]);
    if (!text) continue;
    if (footerOrPrompt(text)) break;
    const option = yesNoOption(text);
    if (option) {
      options.push(option);
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
    for (let i = questionIndex + 1; i < lines.length; i += 1) {
      const label = numberedOption(lines[i]);
      if (label) {
        buttons.push(label);
        continue;
      }
      const text = normalize(lines[i]);
      if (!text) continue;
      if (buttons.length > 0 && footerOrPrompt(text)) break;
      if (buttons.length > 0) break;
    }
    if (buttons.length < 2) continue;

    const context = [];
    for (let i = Math.max(0, questionIndex - 6); i < questionIndex; i += 1) {
      const text = normalize(lines[i]);
      if (!text || footerOrPrompt(text) || numberedOption(text)) continue;
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

  const optionIndexes = findOptionIndexes(lines);
  const optionLines = optionIndexes.map((index) => numberedOption(lines[index])).filter(Boolean);

  const feedbackIndex = normalized.findIndex((line) => /^how's the cli experience so far\?/i.test(line));
  if (feedbackIndex >= 0 && /\[0\]\s+skip/i.test(normalized.join(' '))) {
    return {
      message: "How's the CLI experience so far?",
      buttons: ['Good', 'Fine', 'Bad', 'Skip'],
    };
  }

  const trustIndex = normalized.findIndex((line) => /do you trust the files in this folder\?/i.test(line));
  if (trustIndex >= 0 && optionLines.length >= 2) {
    return {
      message: 'Do you trust the files in this folder?',
      buttons: optionLines,
    };
  }

  const trustProjectIndex = normalized.findIndex((line) => /do you trust the contents of this project\?/i.test(line));
  if (trustProjectIndex >= 0) {
    const lineIndex = lines.findIndex((line) => /do you trust the contents of this project\?/i.test(normalize(line)));
    const buttons = collectYesNoOptions(lines, lineIndex >= 0 ? lineIndex : 0);
    if (buttons.length >= 2) {
      return {
        message: 'Do you trust the contents of this project?',
        buttons,
      };
    }
  }

  const proceedIndex = normalized.findIndex((line) => /do you want to proceed\?/i.test(line));
  if (proceedIndex >= 0 && optionLines.length >= 2) {
    const start = normalized.findIndex((line) => /wants to run:/i.test(line));
    const commandLines = [];
    if (start >= 0) {
      for (let i = start + 1; i < lines.length; i += 1) {
        const text = normalize(lines[i]);
        if (!text || footerOrPrompt(text) || numberedOption(text) || /do you want to proceed\?/i.test(text)) break;
        commandLines.push(text);
      }
    }
    const message = commandLines.length > 0
      ? `Do you want to proceed? ${commandLines.join(' ')}`.trim()
      : 'Do you want to proceed?';
    return {
      message,
      buttons: optionLines,
    };
  }

  return buildGenericApproval(lines);
};
