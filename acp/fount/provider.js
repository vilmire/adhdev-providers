/**
 * fount — ACP Provider
 * 
 * Character AI framework with ACP support
 * https://github.com/steve02081504/fount
 * 
 * Install: See https://github.com/steve02081504/fount
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'fount-acp',
  name: 'fount (ACP)',
  category: 'acp',

  displayName: 'fount',
  icon: '⛲',
  install: 'See https://github.com/steve02081504/fount',

  spawn: {
    command: 'fount',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'fount',
      name: 'fount Auth',
      description: 'Configure through fount setup',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when agent requires approval',
    },
    longGeneratingAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Long Generation Alert',
      description: 'Alert when generation takes too long',
    },
    longGeneratingThresholdSec: {
      type: 'number',
      default: 180,
      public: true,
      label: 'Long Generation Threshold (sec)',
      min: 30,
      max: 600,
    },
  },
};
