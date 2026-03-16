/**
 * Codex CLI — ACP Provider
 * 
 * Category: acp (Agent Client Protocol — JSON-RPC over stdio)
 * 
 * Uses @zed-industries/codex-acp adapter:
 * https://github.com/zed-industries/codex-acp
 * 
 * Install: npm install -g @zed-industries/codex-acp
 * Auth: OPENAI_API_KEY or CODEX_API_KEY environment variable
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'codex-acp',
  name: 'Codex (ACP)',
  category: 'acp',

  displayName: 'Codex (ACP)',
  icon: '🤖',
  install: 'npm install -g @zed-industries/codex-acp  (requires OPENAI_API_KEY)',

  // ACP spawn config — uses codex-acp adapter
  spawn: {
    command: 'codex-acp',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'env_var',
      id: 'openai',
      name: 'OpenAI API Key',
      vars: [{ name: 'OPENAI_API_KEY' }],
      link: 'https://platform.openai.com/api-keys',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Codex requires approval',
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
