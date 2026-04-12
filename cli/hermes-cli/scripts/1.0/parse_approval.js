/**
 * Hermes CLI — parse_approval (MVP)
 *
 * Hermes approval UX isn't confirmed yet; return a generic modal.
 */
'use strict';

module.exports = function parseApproval(input) {
  const screenText = String(input?.screenText || input?.buffer || input?.tail || '');
  return {
    title: 'Hermes approval',
    message: screenText.slice(-2000),
    options: [
      { id: 'yes', label: 'Yes', key: 'y' },
      { id: 'no', label: 'No', key: 'n' }
    ]
  };
};
