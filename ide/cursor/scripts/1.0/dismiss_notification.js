/**
 * Cursor — dismiss_notification
 *
 * Close notification toast / click button:
 *   Select target by index or message matching
 *   Click specified button text, otherwise close
 *
 * params.index: number, params.button: string|null, params.message: string|null
 * → { dismissed: true/false }
 */
(params) => {
  try {
    const toasts = [...document.querySelectorAll('.notifications-toasts .notification-toast, .notification-list-item')].filter(t => t.offsetWidth > 0);
    let toast;
    if (params.message) {
      toast = toasts.find(t => (t.querySelector('.notification-list-item-message')?.textContent || t.textContent || '').toLowerCase().includes(params.message.toLowerCase()));
    } else {
      toast = toasts[params.index || 0];
    }
    if (!toast) return JSON.stringify({ dismissed: false, error: 'Toast not found', count: toasts.length });
    if (params.button) {
      const btn = [...toast.querySelectorAll('button')].find(b => b.textContent?.trim().toLowerCase().includes(params.button.toLowerCase()));
      if (btn) { btn.click(); return JSON.stringify({ dismissed: true, clicked: btn.textContent.trim() }); }
      return JSON.stringify({ dismissed: false, error: 'Button not found' });
    }
    const closeBtn = toast.querySelector('.codicon-notifications-clear, .clear-notification-action, .codicon-close');
    if (closeBtn) { closeBtn.click(); return JSON.stringify({ dismissed: true }); }
    return JSON.stringify({ dismissed: false, error: 'Close button not found' });
  } catch(e) { return JSON.stringify({ dismissed: false, error: e.message }); }
}
