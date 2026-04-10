/**
 * Codex Extension — switch_session
 *
 * Opens the recent tasks view and, if needed, drills through one intermediate
 * IDE/session surface before clicking the requested task row.
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

    const getDoc = () => resolveDoc();
    const viewportHeight = () => getDoc().defaultView?.innerHeight || window.innerHeight || 900;
    const normalize = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const getHeaderText = () => normalize(getDoc().querySelector('[style*="view-transition-name: header-title"]')?.textContent || '');
    const timeSelectors = '.tabular-nums, [class*="tabular-nums"], [class*="text-right"]';
    const selector = '[role="button"], [role="menuitem"], [role="menuitemradio"], button';

    const getRowTime = (el) => {
      const direct = Array.from(el.querySelectorAll(timeSelectors))
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .map((node) => normalize(node.textContent || ''))
        .find(Boolean);
      if (direct) return direct;
      const sibling = Array.from(el.parentElement?.querySelectorAll?.(timeSelectors) || [])
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 8 && rect.height > 8;
        })
        .map((node) => normalize(node.textContent || ''))
        .find(Boolean);
      if (sibling) return sibling;
      const raw = normalize(el.textContent || '');
      const fallback = raw.match(/(\d+\s?[smhdw]|today|yesterday|just now|\d{1,2}:\d{2}\s?(?:am|pm))$/i);
      return normalize(fallback?.[1] || '');
    };

    const stripTrailingTime = (raw, timeText) => {
      const source = normalize(raw);
      const time = normalize(timeText);
      if (!source) return '';
      if (!time) return source;
      if (source.endsWith(time)) return normalize(source.slice(0, -time.length));
      return source;
    };

    const isVisible = (el) => {
      if (!el || el.closest('[inert]')) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) return false;
      return rect.bottom >= 36 && rect.top <= viewportHeight() - 12;
    };

    const isHistoryPopover = (el) => {
      if (!isVisible(el)) return false;
      return Array.from(el.querySelectorAll(selector + ', div, li, a'))
        .filter(isVisible)
        .some((node) => !!getRowTime(node));
    };

    const getVisibleHistoryPopovers = () => Array.from(getDoc().querySelectorAll('[role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-side]'))
      .filter(isHistoryPopover);

    const resolveClickTarget = (el) => el?.closest?.('button, a, [role="button"], [role="menuitem"], [role="menuitemradio"], [role="option"]') || el;

    const clickElement = (el, options = {}) => {
      const { useNativeClick = false } = options;
      const target = resolveClickTarget(el);
      const rect = target.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: x, clientY: y }));
      target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
      target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: x, clientY: y }));
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
      if (useNativeClick && typeof target.click === 'function') target.click();
    };

    const allButtons = () => Array.from(getDoc().querySelectorAll('button, [role="button"]')).filter(isVisible);

    const findRecentTasksButton = () => allButtons()
      .filter((button) => {
        const rect = button.getBoundingClientRect();
        return rect.top <= 48 && rect.height <= 32 && rect.width <= 48;
      })
      .find((button) => button.getAttribute('aria-haspopup') === 'menu') || null;

    const hasInlineSessionRows = () => Array.from(getDoc().querySelectorAll('div[role="button"], [role="button"], div, li, a'))
      .filter(isVisible)
      .some((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < 32 || rect.top > 320 || rect.height < 20 || rect.height > 48) return false;
        return !!getRowTime(node);
      });

    const inTasksView = () => !getDoc().querySelector('[data-content-search-turn-key]') && hasInlineSessionRows();
    const hasVisibleHistoryPopover = () => getVisibleHistoryPopovers().length > 0;

    const isIgnorableText = (lowered) => {
      if (!lowered) return true;
      if (/^view all\b/.test(lowered)) return true;
      if (/archive chat/.test(lowered)) return true;
      if (/approve|reject|load older messages|processing/.test(lowered)) return true;
      if (/^(local|remote|default permissions|full access|read only|write enabled)$/.test(lowered)) return true;
      return false;
    };

    const buildEntries = (root, bounds, currentTitle) => Array.from(root.querySelectorAll(selector))
      .filter(isVisible)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const raw = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
        const timeText = getRowTime(el);
        const lowered = raw.toLowerCase();
        if (!raw || raw.length < 3 || raw.length > 180) return null;
        if (rect.height < 20 || rect.height > 48) return null;
        if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 6)) return null;
        if (!bounds && (rect.top < 32 || rect.top > 420)) return null;
        if (!timeText) return null;
        if (isIgnorableText(lowered)) return null;
        const title = stripTrailingTime(raw, timeText);
        if (!title || title.length < 3) return null;
        return {
          el,
          title,
          active: normalize(currentTitle).toLowerCase() === title.toLowerCase(),
          _sortTop: rect.top,
        };
      })
      .filter(Boolean);

    const dedupeEntries = (entries) => {
      const dedup = new Map();
      for (const entry of entries) {
        const key = entry.title.toLowerCase();
        const existing = dedup.get(key);
        if (!existing || entry._sortTop < existing._sortTop) dedup.set(key, entry);
      }
      return Array.from(dedup.values()).sort((a, b) => a._sortTop - b._sortTop);
    };

    const collectSessions = (currentTitle) => {
      const popovers = getVisibleHistoryPopovers();
      if (popovers.length > 0) {
        return dedupeEntries(popovers.flatMap((popover) => buildEntries(popover, popover.getBoundingClientRect(), currentTitle)));
      }
      if (!inTasksView()) return [];
      return dedupeEntries(buildEntries(getDoc(), null, currentTitle));
    };

    const hasMeaningfulSessionList = (currentTitle) => {
      const sessions = collectSessions(currentTitle);
      if (sessions.length > 1) return true;
      if (hasVisibleHistoryPopover() && sessions.length > 0) return true;
      if (sessions.length === 1 && normalize(currentTitle)) {
        return sessions[0].title.toLowerCase() !== normalize(currentTitle).toLowerCase();
      }
      return false;
    };

    const openTasksView = async (currentTitle) => {
      if (hasMeaningfulSessionList(currentTitle)) return true;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const recentTasks = findRecentTasksButton();
        if (!recentTasks) return false;
        clickElement(recentTasks, { useNativeClick: true });
        await sleep(350 + attempt * 250);
        if (hasMeaningfulSessionList(currentTitle)) return true;
      }
      return false;
    };

    const collectDrillCandidates = (currentTitle) => {
      const popovers = getVisibleHistoryPopovers();
      const roots = popovers.length > 0 ? popovers : [getDoc()];
      const entries = [];
      for (const root of roots) {
        const bounds = root === getDoc() ? null : root.getBoundingClientRect();
        const nodes = Array.from(root.querySelectorAll(selector)).filter(isVisible);
        for (const el of nodes) {
          const rect = el.getBoundingClientRect();
          const raw = normalize(el.textContent || el.getAttribute?.('aria-label') || '');
          const lowered = raw.toLowerCase();
          if (!raw || raw.length < 3 || raw.length > 180) continue;
          if (rect.height < 20 || rect.height > 52) continue;
          if (bounds && (rect.top < bounds.top || rect.bottom > bounds.bottom + 6)) continue;
          if (!bounds && (rect.top < 32 || rect.top > 420)) continue;
          if (isIgnorableText(lowered)) continue;
          entries.push({
            el,
            title: raw,
            active: normalize(currentTitle).toLowerCase() === raw.toLowerCase(),
            _sortTop: rect.top,
          });
        }
      }
      const seen = new Set();
      return entries
        .filter((entry) => {
          const key = entry.title.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => {
          if (a.active !== b.active) return a.active ? 1 : -1;
          return a._sortTop - b._sortTop;
        });
    };

    const rawTitle = typeof args === 'string' ? args : args?.title;
    const targetTitle = normalize(rawTitle || '');
    const targetIndex = Number.isFinite(Number(args?.index)) ? Number(args.index) : null;
    const currentHeader = getHeaderText();

    if (!targetTitle && targetIndex == null) {
      return JSON.stringify({ switched: false, error: 'title or index is required' });
    }

    const opened = await openTasksView(currentHeader);
    if (!opened) {
      return JSON.stringify({ switched: false, error: 'Recent tasks dialog not visible' });
    }

    let candidates = collectSessions(currentHeader);

    const findTarget = () => {
      if (targetTitle) {
        const lowered = targetTitle.toLowerCase();
        return candidates.find((candidate) => candidate.title.toLowerCase() === lowered)
          || candidates.find((candidate) => candidate.title.toLowerCase().includes(lowered) || lowered.includes(candidate.title.toLowerCase()))
          || null;
      }
      if (targetIndex != null) return candidates[targetIndex] || null;
      return null;
    };

    let target = findTarget();

    if (!target && candidates.length <= 1) {
      for (const candidate of collectDrillCandidates(currentHeader).slice(0, 3)) {
        clickElement(candidate.el, { useNativeClick: true });
        await sleep(550);
        candidates = collectSessions(currentHeader);
        target = findTarget();
        if (target) break;
        if (candidates.length > 1 && targetIndex != null) {
          target = candidates[targetIndex] || null;
          if (target) break;
        }
        if (!inTasksView() && !hasVisibleHistoryPopover()) {
          const reopened = await openTasksView(currentHeader);
          if (!reopened) break;
          candidates = collectSessions(currentHeader);
          target = findTarget();
          if (target) break;
        }
      }
    }

    if (!target) {
      return JSON.stringify({
        switched: false,
        error: 'Session not found',
        available: candidates.map((candidate) => candidate.title),
        opened,
      });
    }

    clickElement(target.el, { useNativeClick: true });

    let newHeader = currentHeader;
    let switched = false;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await sleep(150);
      newHeader = getHeaderText();
      switched = !inTasksView() && (
        !currentHeader
        || newHeader.toLowerCase() === target.title.toLowerCase()
        || newHeader.toLowerCase().includes(target.title.toLowerCase())
        || target.title.toLowerCase().includes(newHeader.toLowerCase())
        || (newHeader && newHeader !== currentHeader)
      );
      if (switched) break;
    }

    return JSON.stringify({
      switched,
      title: target.title,
      previousTitle: currentHeader || null,
      currentTitle: newHeader || null,
      available: candidates.map((candidate) => candidate.title),
    });
  } catch (e) {
    return JSON.stringify({ switched: false, error: e.message || String(e) });
  }
})
