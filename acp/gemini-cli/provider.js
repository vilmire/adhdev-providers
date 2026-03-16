/**
 * Gemini CLI — ACP Provider
 * 
 * Google's official CLI for Gemini with ACP support
 * https://github.com/google-gemini/gemini-cli
 * 
 * Install: npm install -g @google/gemini-cli
 * Auth: GOOGLE_API_KEY or gcloud auth
 * 
 * Note: Gemini CLI does NOT support ACP config/* methods.
 * Model/mode are set via CLI flags (-m, --approval-mode) at spawn time.
 * Changing model/mode requires process restart with new args.
 * 
 * @type {import('../../../../src/providers/contracts').ProviderModule}
 */
module.exports = {
  type: 'gemini-acp',
  name: 'Gemini CLI (ACP)',
  category: 'acp',

  displayName: 'Gemini (ACP)',
  icon: '♊',
  install: 'npm install -g @google/gemini-cli',

  spawn: {
    command: 'gemini',
    args: ['--experimental-acp'],
    shell: false,
  },

  auth: [
    {
      type: 'env_var',
      id: 'google',
      name: 'Google API Key',
      vars: [{ name: 'GOOGLE_API_KEY' }],
      link: 'https://aistudio.google.com/apikey',
    },
    {
      type: 'agent',
      id: 'gcloud',
      name: 'Google Cloud Auth',
      description: 'Authenticate via gcloud auth application-default login',
    },
  ],

  // Gemini CLI는 config/* 미지원 → 정적 옵션으로 대시보드 UI 제공
  staticConfigOptions: [
    {
      category: 'model',
      configId: 'model',
      defaultValue: 'gemini-2.5-pro',
      options: [
        { value: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', group: '2.5' },
        { value: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', group: '2.5' },
        { value: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', group: '2.0' },
      ],
    },
    {
      category: 'mode',
      configId: 'approval_mode',
      defaultValue: 'default',
      options: [
        { value: 'default', name: 'Default', description: 'Prompt for approval' },
        { value: 'auto_edit', name: 'Auto Edit', description: 'Auto-approve file edits' },
        { value: 'yolo', name: 'YOLO', description: 'Auto-approve all actions' },
        { value: 'plan', name: 'Plan', description: 'Read-only planning mode' },
      ],
    },
  ],

  // 선택된 config → spawn args 변환
  spawnArgBuilder: (config) => {
    const args = ['--experimental-acp'];
    if (config.model) args.push('-m', config.model);
    if (config.approval_mode && config.approval_mode !== 'default') {
      args.push('--approval-mode', config.approval_mode);
    }
    return args;
  },

  settings: {
    approvalAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Approval Alerts',
    },
    longGeneratingAlert: {
      type: 'boolean',
      default: true,
      public: true,
      label: 'Long Generation Alert',
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
