(async () => {
  try {
    const frame = document.getElementById('active-frame');
    const doc = frame?.contentDocument || frame?.contentWindow?.document || document;
    const view = doc.defaultView || window;
    const action = ${ ACTION };
    const buttonText = ${ BUTTON_TEXT };

    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const normalizeApprovalLabel = (value) => normalize(value).replace(/^\d+(?:\s*[.)]|\s)+/, '').trim().toLowerCase();
    const isVisible = (el) => {
      if (!el || el.closest?.('[inert]')) return false;
      const rect = el.getBoundingClientRect?.() || { width: 0, height: 0, left: 0, top: 0 };
      const style = (el.ownerDocument?.defaultView || view).getComputedStyle?.(el);
      return rect.width > 8 && rect.height > 8 && style?.display !== 'none' && style?.visibility !== 'hidden';
    };
    const clickElement = (el) => {
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      el.dispatchEvent(new view.PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new view.PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      el.dispatchEvent(new view.MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      el.dispatchEvent(new view.MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      if (typeof el.click === 'function') el.click();
      return true;
    };
    const getLabel = (el) => normalize(el?.textContent || el?.getAttribute?.('aria-label') || el?.getAttribute?.('title') || '');
    const collectTargets = () => {
      const searchDocs = Array.from(new Set([doc, document].filter(Boolean)));
      const targets = [];
      const seen = new Set();
      for (const searchDoc of searchDocs) {
        const nodes = Array.from(searchDoc.querySelectorAll('button, [role="button"], [role="option"], [role="radio"]'));
        for (const node of nodes) {
          if (!isVisible(node) || node.disabled) continue;
          const label = getLabel(node);
          if (!label || label.length > 160) continue;
          const key = `${label.toLowerCase()}::${node.tagName || ''}::${node.getAttribute?.('role') || ''}`;
          if (seen.has(key)) continue;
          seen.add(key);
          targets.push({ node, label, approvalLabel: normalizeApprovalLabel(label), normalized: label.toLowerCase() });
        }
      }
      return targets;
    };

    const targets = collectTargets();
    const targetText = normalize(buttonText).toLowerCase();

    if (targetText) {
      const exact = targets.find(({ normalized }) => normalized === targetText);
      if (exact) {
        clickElement(exact.node);
        return JSON.stringify({ resolved: true, clicked: exact.label });
      }
      const partial = targets.find(({ normalized }) => normalized.includes(targetText) || targetText.includes(normalized));
      if (partial) {
        clickElement(partial.node);
        return JSON.stringify({ resolved: true, clicked: partial.label });
      }
    }

    const numMatch = String(buttonText || '').match(/^(\d+)/);
    if (numMatch) {
      const numericTarget = targets.find(({ normalized }) => normalized.startsWith(`${numMatch[1]}.`) || normalized.startsWith(`${numMatch[1]} `));
      if (numericTarget) {
        clickElement(numericTarget.node);
        return JSON.stringify({ resolved: true, clicked: numericTarget.label });
      }

      const input = doc.querySelector('[role="textbox"].messageInput_cKsPxg, [role="textbox"][contenteditable="true"]');
      const sendButton = doc.querySelector('button.sendButton_gGYT1w, button[aria-label*="send" i]');
      if (!input || !sendButton) return JSON.stringify({ resolved: false, error: 'numeric approval input or send button not found' });

      const num = numMatch[1];
      input.focus();

      const selection = view.getSelection();
      const range = doc.createRange();
      range.selectNodeContents(input);
      selection.removeAllRanges();
      selection.addRange(range);
      try { doc.execCommand('delete', false); } catch {}
      input.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));

      let inserted = false;
      try { inserted = doc.execCommand('insertText', false, num); } catch {}
      if (!inserted) input.textContent = num;

      input.dispatchEvent(new view.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: num }));
      input.dispatchEvent(new view.InputEvent('input', { bubbles: true, inputType: 'insertText', data: num }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));

      await new Promise((resolve) => setTimeout(resolve, 80));
      if (sendButton.disabled) return JSON.stringify({ resolved: false, error: 'send button stayed disabled after numeric approval input' });
      clickElement(sendButton);
      return JSON.stringify({ resolved: true, clicked: num });
    }

    const approvePatterns = ['yes', 'allow once', 'approve', 'accept', 'continue', 'run', 'proceed', 'confirm', 'submit', 'save', 'resume', 'trust', 'allow', 'always allow'];
    const rejectPatterns = ['reject', 'deny', 'cancel', 'dismiss', 'no', 'skip', 'abort'];
    const patterns = action === 'approve' ? approvePatterns : rejectPatterns;
    const match = targets.find(({ approvalLabel }) => patterns.some((pattern) => approvalLabel === pattern || approvalLabel.startsWith(pattern) || approvalLabel.includes(pattern)));
    if (!match) {
      return JSON.stringify({ resolved: false, error: 'approval target not found', available: targets.map((target) => target.label) });
    }

    clickElement(match.node);
    return JSON.stringify({ resolved: true, clicked: match.label });
  } catch (e) {
    return JSON.stringify({ resolved: false, error: e.message || String(e) });
  }
})();
