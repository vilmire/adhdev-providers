/**
 * Codex Extension — resolve_action
 *
 * Clicks approval / denial controls in the Codex UI.
 */
(args = {}) => {
  try {
    const findValue = (source, keys) => {
      if (typeof source === 'string') return source;
      const queue = [source];
      const seen = new Set();
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item || typeof item !== 'object' || seen.has(item)) continue;
        seen.add(item);
        for (const key of keys) {
          if (item[key] != null) return item[key];
        }
        for (const value of Object.values(item)) {
          if (value && typeof value === 'object') queue.push(value);
        }
      }
      return undefined;
    };

    const actionValue = findValue(args, ['action']);
    const buttonValue = findValue(args, ['button', 'buttonText']);
    const action = actionValue != null ? String(actionValue) : 'approve';
    const buttonText = buttonValue != null ? String(buttonValue) : '';

    const getLabel = (el) => {
      const text = (el.textContent || '').trim();
      return text || (el.getAttribute('aria-label') || '').trim();
    };
    const normalize = (text) => (text || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const isVisible = (el) => !!el && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.closest('[inert]');
    const clickElement = (el) => {
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
    };

    const findApprovalArea = () => {
      const requestPanel = document.querySelector('[class*="request-input-panel"]');
      if (!requestPanel) return document.body;
      let node = requestPanel;
      for (let depth = 0; depth < 10 && node; depth += 1) {
        const interactiveCount = node.querySelectorAll('button, [role="radio"], [role="button"], [role="option"]').length;
        if (interactiveCount >= 2) return node;
        node = node.parentElement;
      }
      return requestPanel.parentElement || document.body;
    };

    const findRequestInput = (root) => {
      return root.querySelector('[class*="request-input-panel"]')
        || document.querySelector('[class*="request-input-panel"]')
        || root.querySelector('textarea')
        || document.querySelector('textarea')
        || root.querySelector('input[type="text"]')
        || document.querySelector('input[type="text"]')
        || null;
    };

    const setInputValue = (input, value) => {
      if (!input) return false;
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(input.__proto__, 'value')?.set;
      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: value,
      }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };

    const parseNumberedOptions = (root) => {
      const text = (root.innerText || root.textContent || '').trim();
      const buttonTexts = Array.from(root.querySelectorAll('button'))
        .filter((el) => isVisible(el) && !el.disabled)
        .map((el) => getLabel(el));

      const matches = text.match(/\d+\.\s*(?:\n\s*)?[^\n]+(?:\n(?!\s*(?:\d+\.|Skip\b|Submit\b))[^\n]+)*/g) || [];
      return matches
        .map((entry) => entry.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
        .map((entry) => {
          let cleaned = entry;
          for (const btnText of buttonTexts) {
            if (btnText && cleaned.endsWith(btnText)) {
              cleaned = cleaned.slice(0, -btnText.length).trim();
            }
          }
          const number = cleaned.match(/^(\d+)\./)?.[1] || '';
          return { text: cleaned, number };
        })
        .filter(({ text, number }) => text && number);
    };

    const findOptionElements = (root) => {
      const nodes = Array.from(root.querySelectorAll('*')).filter((el) => {
        if (!isVisible(el)) return false;
        if (/^(button|textarea|input)$/i.test(el.tagName)) return false;
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!/^\d+\./.test(text) || text.length > 160) return false;
        return !Array.from(el.children).some((child) => {
          const childText = (child.textContent || '').replace(/\s+/g, ' ').trim();
          return /^\d+\./.test(childText);
        });
      });
      return nodes.map((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const number = text.match(/^(\d+)\./)?.[1] || '';
        return { el, text, number };
      });
    };

    const resolveTypedChoice = (options, actionName, explicitLabel) => {
      const desired = normalize(explicitLabel || actionName || '');
      if (explicitLabel) {
        const direct = options.find(({ text }) => normalize(text) === desired)
          || options.find(({ text }) => normalize(text).includes(desired) || desired.includes(normalize(text)));
        if (direct) return direct;
      }

      if (actionName.toLowerCase() === 'approve') {
        return options.find(({ text }) => /^(1\.|1\s)/.test(text) || /\byes\b|\ballow\b|\bapprove\b|\bcontinue\b/i.test(text)) || null;
      }
      if (actionName.toLowerCase() === 'deny') {
        return options.find(({ text }) => /\bno\b|\breject\b|\bdeny\b|\bdecline\b/i.test(text)) || null;
      }
      if (actionName.toLowerCase() === 'cancel') {
        return options.find(({ text }) => /\bskip\b|\bcancel\b|\babort\b/i.test(text)) || null;
      }

      return options.find(({ text }) => normalize(text) === desired)
        || options.find(({ text }) => normalize(text).includes(desired) || desired.includes(normalize(text)))
        || null;
    };

    const approvalArea = findApprovalArea();
    const buttons = Array.from(
      approvalArea.querySelectorAll('button, [role="radio"], [role="button"], [role="option"], input[type="radio"] + label'),
    ).filter((el) => isVisible(el) && !el.disabled);

    const wanted = (buttonText || action || '').trim();
    const wantedLower = wanted.toLowerCase();
    const actionLower = action.toLowerCase();
    const patterns = {
      approve: /^(approve|accept|allow|confirm|run|proceed|yes|execute|check|continue)/i,
      deny: /^(deny|reject|decline|no)/i,
      cancel: /^(cancel|stop|abort|dismiss|skip)/i,
    };

    let target = null;
    if (buttonText) {
      target = buttons.find((el) => getLabel(el) === buttonText)
        || buttons.find((el) => getLabel(el).startsWith(buttonText))
        || buttons.find((el) => getLabel(el).toLowerCase().includes(buttonText.toLowerCase()));
    }

    if (!target && patterns[actionLower]) {
      target = buttons.find((el) => patterns[actionLower].test(getLabel(el)));
    }

    if (!target && wantedLower) {
      target = buttons.find((el) => getLabel(el).toLowerCase() === wantedLower)
        || buttons.find((el) => getLabel(el).toLowerCase().includes(wantedLower));
    }

    if (!target) {
      const requestInput = findRequestInput(approvalArea);
      const options = parseNumberedOptions(approvalArea);
      const optionElements = findOptionElements(approvalArea);
      const typedChoice = resolveTypedChoice(options, action, buttonText || wanted);
      const clickedChoice = resolveTypedChoice(optionElements, action, buttonText || wanted);
      const submitButton = buttons.find((el) => /^(submit|apply|continue)/i.test(getLabel(el)));

      if (clickedChoice) {
        clickElement(clickedChoice.el);
        if (submitButton) clickElement(submitButton);
        return JSON.stringify({
          resolved: true,
          action,
          clicked: clickedChoice.text,
          submitted: !!submitButton,
        });
      }

      if (requestInput && typedChoice && submitButton) {
        setInputValue(requestInput, typedChoice.number);
        clickElement(submitButton);
        return JSON.stringify({
          resolved: true,
          action,
          clicked: typedChoice.text,
          submitted: true,
        });
      }
    }

    if (!target) {
      return JSON.stringify({
        resolved: false,
        error: `No button matching '${wanted}' found`,
        available: [
          ...buttons.map((el) => getLabel(el)).filter((text) => text && text.length < 100),
          ...parseNumberedOptions(approvalArea).map(({ text }) => text),
        ],
      });
    }

    const clicked = getLabel(target);
    clickElement(target);

    if (/^\d+\./.test(clicked)) {
      const submit = buttons.find((el) => /^(submit|apply|continue)/i.test(getLabel(el)));
      if (submit && submit !== target) clickElement(submit);
    }

    return JSON.stringify({ resolved: true, action, clicked });
  } catch (e) {
    return JSON.stringify({ resolved: false, error: e.message || String(e) });
  }
}
