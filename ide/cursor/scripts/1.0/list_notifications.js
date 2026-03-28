/**
 * Cursor — list_notifications
 *
 * VS Code notification toast list:
 *   .notifications-toasts .notification-toast
 *   .notification-list-item
 *
 * params.filter: string|null — Message filter
 * → [{ index, message, severity, buttons }]
 */
(params) => {
  try {
    const toasts = [...document.querySelectorAll('.notifications-toasts .notification-toast, .notification-list-item')];
    const visible = toasts.filter(t => t.offsetWidth > 0).map((t, i) => ({
      index: i,
      message: t.querySelector('.notification-list-item-message')?.textContent?.trim() || t.textContent?.trim().substring(0, 200),
      severity: t.querySelector('.codicon-error') ? 'error' : t.querySelector('.codicon-warning') ? 'warning' : 'info',
      buttons: [...t.querySelectorAll('.notification-list-item-buttons-container button, .monaco-button')].map(b => b.textContent?.trim()).filter(Boolean),
    }));
    const f = params.filter || null;
    return JSON.stringify(f ? visible.filter(n => n.message.toLowerCase().includes(f.toLowerCase())) : visible);
  } catch(e) { return JSON.stringify([]); }
}
