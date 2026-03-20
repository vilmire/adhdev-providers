/**
 * Cursor — send_message
 *
 * Cursor는 cdp-type-and-send 방식:
 *   1. 입력 필드 존재 확인
 *   2. needsTypeAndSend: true 반환 → daemon이 CDP로 타이핑 + Enter 처리
 *
 * 입력 셀렉터: .aislash-editor-input[contenteditable="true"]
 * 파라미터: ${ MESSAGE } (사용되지 않음 — daemon이 직접 타이핑)
 */
(() => {
  try {
    const input = document.querySelector('.aislash-editor-input[contenteditable="true"]');
    if (!input) return JSON.stringify({ sent: false, error: 'Input box not found' });
    return JSON.stringify({
      sent: false,
      needsTypeAndSend: true,
      selector: '.aislash-editor-input[contenteditable="true"]',
    });
  } catch(e) {
    return JSON.stringify({ sent: false, error: e.message });
  }
})()
