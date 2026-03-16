/**
 * Stakpak — ACP Provider
 * 
 * Open-source DevOps agent in Rust with enterprise-grade security
 * https://github.com/stakpak/agent
 * 
 * Install: Download from https://github.com/stakpak/agent/releases
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'stakpak-acp',
  name: 'Stakpak (ACP)',
  category: 'acp',

  displayName: 'Stakpak',
  icon: '🛡️',
  install: 'Download from https://github.com/stakpak/agent/releases',

  spawn: {
    command: 'stakpak',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'stakpak',
      name: 'Stakpak Auth',
      description: 'Configure provider through Stakpak setup',
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
