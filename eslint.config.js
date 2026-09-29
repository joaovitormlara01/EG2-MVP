import js from '@eslint/js';
import globals from 'globals';

const regrasComuns = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-var': 'error',
  'prefer-const': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'no-implicit-globals': 'error',
  'no-console': 'off',
};

export default [
  { ignores: ['node_modules/', 'coverage/'] },
  js.configs.recommended,
  {
    // Servidor, scripts, migrações e testes: Node.js 24, ES modules.
    files: ['src/**/*.js', 'scripts/**/*.js', 'tests/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: regrasComuns,
  },
  {
    // Frontend: navegador, ES modules nativos, sem build e sem acesso a APIs do Node.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...regrasComuns,
      'no-restricted-globals': ['error', 'process', 'require', 'Buffer', '__dirname'],
      // Estado de sessão e dados de negócio não ficam no armazenamento do navegador.
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'localStorage', message: 'Dados ficam no servidor.' },
        { object: 'window', property: 'sessionStorage', message: 'Dados ficam no servidor.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "Identifier[name='localStorage']", message: 'Dados ficam no servidor.' },
        { selector: "Identifier[name='sessionStorage']", message: 'Dados ficam no servidor.' },
        {
          selector: "MemberExpression[property.name='innerHTML']",
          message: 'Use textContent/replaceChildren para evitar XSS.',
        },
      ],
    },
  },
];
