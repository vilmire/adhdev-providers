/**
 * Kimi CLI — ACP Provider
 * 
 * Moonshot AI's coding assistant
 * https://github.com/MoonshotAI/kimi-cli
 * 
 * Install: Binary download from GitHub releases
 *   See: https://github.com/MoonshotAI/kimi-cli/releases
 * 
 * Auth: MOONSHOT_API_KEY environment variable
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'kimi-acp',
  name: 'Kimi CLI (ACP)',
  category: 'acp',

  displayName: 'Kimi CLI',
  icon: '🌙',
  install: 'Download from https://github.com/MoonshotAI/kimi-cli/releases  (requires MOONSHOT_API_KEY)',

  spawn: {
    command: 'kimi',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'env_var',
      id: 'moonshot',
      name: 'Moonshot API Key',
      vars: [{ name: 'MOONSHOT_API_KEY' }],
      link: 'https://platform.moonshot.cn/console/api-keys',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Kimi requires approval',
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
