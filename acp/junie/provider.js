/**
 * Junie — ACP Provider
 * 
 * AI Coding Agent by JetBrains
 * https://github.com/JetBrains/junie
 * 
 * Install: Binary download from GitHub releases
 *   See: https://github.com/JetBrains/junie/releases
 * 
 * Auth: JetBrains account or API key
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'junie-acp',
  name: 'Junie (ACP)',
  category: 'acp',

  displayName: 'Junie',
  icon: '🟣',
  install: 'Download from https://github.com/JetBrains/junie/releases',

  spawn: {
    command: 'junie',
    args: [],
    shell: false,
  },

  auth: [
    {
      type: 'agent',
      id: 'jetbrains',
      name: 'JetBrains Account',
      description: 'Authenticate with JetBrains account',
    },
  ],

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
      description: 'Show notification when Junie requires approval',
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
