/**
 * Mistral Vibe — ACP Provider
 * 
 * Mistral's open-source coding assistant
 * https://github.com/mistralai/mistral-vibe
 * 
 * Install: Binary download from GitHub releases
 *   See: https://github.com/mistralai/mistral-vibe/releases
 * 
 * Auth: MISTRAL_API_KEY environment variable
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'mistral-vibe-acp',
  name: 'Mistral Vibe (ACP)',
  category: 'acp',

  displayName: 'Mistral Vibe',
  icon: '🟧',
  install: 'Download from https://github.com/mistralai/mistral-vibe/releases  (requires MISTRAL_API_KEY)',

  spawn: {
    command: 'mistral-vibe',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'env_var',
      id: 'mistral',
      name: 'Mistral API Key',
      vars: [{ name: 'MISTRAL_API_KEY' }],
      link: 'https://console.mistral.ai/api-keys/',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Mistral Vibe requires approval',
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
