/**
 * OpenCode — ACP Provider
 * 
 * The open source coding agent
 * https://github.com/anomalyco/opencode
 * 
 * Install: Binary download from GitHub releases
 *   See: https://github.com/anomalyco/opencode/releases
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'opencode-acp',
  name: 'OpenCode (ACP)',
  category: 'acp',

  displayName: 'OpenCode',
  icon: '📦',
  install: 'Download from https://github.com/anomalyco/opencode/releases',

  spawn: {
    command: 'opencode',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'opencode-settings',
      name: 'OpenCode Settings',
      description: 'Configure provider through OpenCode interactive setup',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when OpenCode requires approval',
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
