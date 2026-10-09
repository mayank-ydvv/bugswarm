const node = { console: 'readonly', process: 'readonly', URL: 'readonly' };
const browser = { document: 'readonly', window: 'readonly', location: 'readonly', URLSearchParams: 'readonly', console: 'readonly' };
const rules = { 'no-unused-vars': 'error', 'no-undef': 'error' };

export default [
  { files: ['**/*.js'], ignores: ['public/**'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: node }, rules },
  { files: ['public/**/*.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: browser }, rules },
];
