/**
 * Kilo — ACP Provider
 * 
 * The open source coding agent (KiloCode)
 * https://github.com/Kilo-Org/kilocode
 * 
 * Install: npm install -g @kilocode/cli
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'kilo-acp',
  name: 'Kilo (ACP)',
  category: 'acp',

  displayName: 'Kilo',
  icon: '🟢',
  install: 'npm install -g @kilocode/cli',

  spawn: {
    command: 'kilo',
    args: ['acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'kilo-settings',
      name: 'Kilo Settings',
      description: 'Configure API keys through Kilo interactive setup',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Kilo requires approval',
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
