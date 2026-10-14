import js from '@eslint/js';
import ts from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';

export default ts.config(
  { ignores: ['node_modules/**', 'out/**', 'dist/**', 'test-results/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-nested-ternary': 'error',
      'max-depth': ['error', 3],
      complexity: ['error', 12],
      'max-lines': ['error', { max: 250, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
    },
  },
  { files: ['**/*.test.{ts,tsx}'], rules: { 'max-lines-per-function': 'off' } },
  {
    files: ['src/backend/domain/**/*.ts', 'src/backend/application/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'electron',
                'openai',
                'openai/*',
                'react',
                '**/infrastructure/**',
                '**/main/**',
                '**/renderer/**',
              ],
              message: 'Le domaine et les cas d’usage dépendent de ports, jamais des adaptateurs.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    ignores: ['src/renderer/design-tokens.test.ts', 'src/renderer/design-tokens-support.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'electron',
                'openai',
                'openai/*',
                '**/backend/infrastructure/**',
                '**/main/**',
              ],
              message: 'Le renderer utilise exclusivement l’API typée du preload.',
            },
          ],
        },
      ],
    },
  },
);
