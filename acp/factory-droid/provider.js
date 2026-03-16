/**
 * Factory Droid — ACP Provider
 * 
 * AI coding agent powered by Factory AI
 * 
 * Install: npm install -g droid
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'factory-droid-acp',
  name: 'Factory Droid (ACP)',
  category: 'acp',

  displayName: 'Factory Droid',
  icon: '🏭',
  install: 'npm install -g droid',

  spawn: {
    command: 'droid',
    args: ['exec', '--output-format', 'acp'],
    shell: false,
    env: { DROID_DISABLE_AUTO_UPDATE: '1', FACTORY_DROID_AUTO_UPDATE_ENABLED: 'false' },
  },

  auth: [
    {
      type: 'agent',
      id: 'factory',
      name: 'Factory Auth',
      description: 'Authenticate with Factory AI account',
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
