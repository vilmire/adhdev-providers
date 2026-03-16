/**
 * Cline — ACP Provider
 * 
 * Autonomous coding agent CLI with ACP support
 * https://github.com/cline/cline
 * 
 * Install: npm install -g cline
 * Auth: Configured via Cline settings (API keys for various providers)
 * 
 * Note: cline-acp repo is archived. Main `cline` CLI now supports ACP directly.
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'cline-acp',
  name: 'Cline (ACP)',
  category: 'acp',

  displayName: 'Cline (ACP)',
  icon: '🔵',
  install: 'npm install -g cline',

  spawn: {
    command: 'cline',
    args: ['--acp'],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'cline-settings',
      name: 'Cline Settings',
      description: 'Configure API keys through Cline interactive setup',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Cline requires approval',
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
