/**
 * Codex Extension — switch_session
 *
 * Opens the recent tasks view, clicks the requested session row, and confirms
 * the resulting header changed to the requested conversation title.
 */
(async (args = {}) => {
  try {
    const resolveDoc = () => {
      if (document.getElementById('root')) return document;
      for (const iframe of document.querySelectorAll('iframe')) {
        try {
          const innerDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (innerDoc?.getElementById('root')) return innerDoc;
        } catch {}
      }
      return document;
    };

    const doc = resolveDoc();
    const viewportHeight = () => doc.defaultView?.innerHeight || window.innerHeight || 900;
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getHeaderText = () => normalize(doc.querySelector('[style*="view-transition-name: header-title"]')?.textContent || '');
    const isVisible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      return rect.bottom >= 36 && rect.top <= viewportHeight() - 12;
    };
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
    const allButtons = () => Array.from(doc.querySelectorAll('button, [role="button"]')).filter(isVisible);
    const findButton = (predicate) => allButtons().find((button) => predicate(normalize(`${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`).toLowerCase(), button));
    const findBackButton = () => findButton((label) => /\bback\b|go back/.test(label));
    const findRecentTasksButton = () => findButton((label) => /recent tasks|task in progress|tasks?/.test(label) && !/new chat/.test(label));
    const inTasksView = () => /^tasks$/i.test(getHeaderText());

    const openTasksView = async () => {
      if (inTasksView()) return true;
      const backButton = findBackButton();
      if (backButton) {
        clickElement(backButton);
        await sleep(550);
        if (inTasksView()) return true;
      }
      const recentTasks = findRecentTasksButton();
      if (recentTasks) {
        clickElement(recentTasks);
        await sleep(550);
        if (inTasksView()) return true;
      }
      return false;
    };

    const selector = 'button, [role="button"], div, li, a';
    const rawTitle = typeof args === 'string' ? args : args?.title;
    const targetTitle = normalize(rawTitle || '');
    const targetIndex = Number.isFinite(Number(args?.index)) ? Number(args.index) : null;
    const currentHeader = getHeaderText();

    if (!targetTitle && targetIndex == null) {
      return JSON.stringify({ switched: false, error: 'title or index is required' });
    }

    const opened = await openTasksView();
    if (!opened) {
      return JSON.stringify({ switched: false, error: 'Recent tasks view not available' });
    }

    const parseTitle = (raw) => {
      const value = normalize(raw || '');
      if (!value) return null;
      const match = value.match(/^(.*?)(\d+\s?[smhdw]|today|yesterday|just now|\d{1,2}:\d{2}\s?(?:am|pm))$/i);
      return normalize(match?.[1] || value) || null;
    };

    const candidates = Array.from(doc.querySelectorAll(selector))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const text = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
        const role = (el.getAttribute?.('role') || '').toLowerCase();
        const className = typeof el.className === 'string' ? el.className : '';
        return { el, rect, text, role, className };
      })
      .filter(({ rect, text, role, className }) => {
        if (!text || text.length < 3 || text.length > 140) return false;
        if (rect.top < 40 || rect.top > 240 || rect.height < 20 || rect.height > 42) return false;
        const lowered = text.toLowerCase();
        if (/^(back|new chat|tasks?|recent tasks?)$/.test(lowered)) return false;
        if (/^\d+\s+task(s)?\s+in\s+progress$/.test(lowered)) return false;
        if (/^view all\b/.test(lowered)) return false;
        if (/archive chat/.test(lowered)) return false;
        if (/approve|reject|load older messages|processing/.test(lowered)) return false;
        return true;
      })
      .sort((a, b) => a.rect.top - b.rect.top);

    const dedup = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const title = parseTitle(candidate.text);
      const key = title.toLowerCase();
      if (!title || seen.has(key)) continue;
      seen.add(key);
      dedup.push({ ...candidate, title });
    }

    let target = null;
    if (targetTitle) {
      const lowered = targetTitle.toLowerCase();
      target = dedup.find((candidate) => candidate.title.toLowerCase() === lowered)
        || dedup.find((candidate) => candidate.title.toLowerCase().includes(lowered) || lowered.includes(candidate.title.toLowerCase()));
    }
    if (!target && targetIndex != null) target = dedup[targetIndex] || null;

    if (!target) {
      const available = dedup.map((candidate) => candidate.title);
      const backButton = findBackButton();
      if (backButton) clickElement(backButton);
      return JSON.stringify({ switched: false, error: 'Session not found', available });
    }

    clickElement(target.el);
    await sleep(700);

    const newHeader = getHeaderText();
    const switched = !inTasksView() && (
      !currentHeader
      || newHeader.toLowerCase() === target.title.toLowerCase()
      || newHeader.toLowerCase().includes(target.title.toLowerCase())
      || target.title.toLowerCase().includes(newHeader.toLowerCase())
      || newHeader !== currentHeader
    );

    return JSON.stringify({
      switched,
      title: target.title,
      previousTitle: currentHeader || null,
      currentTitle: newHeader || null,
    });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message || String(e) });
  }
})
