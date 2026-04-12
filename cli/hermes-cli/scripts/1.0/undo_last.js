'use strict';

const { buildPtyWrite } = require('./helpers.js');

module.exports = function undoLast() {
  const effectId = `hermes_undo_${Date.now()}`;
  return buildPtyWrite('/undo', {
    effects: [
      {
        id: effectId,
        type: 'notification',
        notification: {
          title: 'Undo sent',
          body: 'Hermes undo was requested. Transcript updates may lag briefly.',
          level: 'info',
          channels: ['toast', 'bubble'],
          bubbleContent: 'Undo requested in Hermes.',
        },
      },
      {
        id: `${effectId}_message`,
        type: 'message',
        message: {
          role: 'system',
          senderName: 'System',
          content: 'Undo requested in Hermes. Dashboard transcript may update shortly.',
        },
      },
    ],
  });
};
