import path from 'path'
import process from 'process'
import { fileURLToPath } from 'url'

import tsEslint from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import importPlugin from 'eslint-plugin-import-x'
import prettierPlugin from 'eslint-plugin-prettier'
import pluginVue from 'eslint-plugin-vue'
import globals from 'globals'
import vueEslintParser from 'vue-eslint-parser'

const fileName = fileURLToPath(import.meta.url)

export default [
  {
    files: [
      'contract/**/*.ts',
      'src/**/*.js',
      'src/**/*.ts',
      'src/**/**/*.ts',
      'src/**/*.vue',
      'src/**/**/*.vue',
      'src/*.vue',
      '*.config.ts',
      '*.vue',
      'eslint.config.js',
      '*.ts'
    ],
    languageOptions: {
      parser: vueEslintParser,
      parserOptions: {
        parser: tsParser,
        tsconfigRootDir: path.dirname(fileName),
        project: ['./tsconfig.eslint.json'],
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
        ecmaFeatures: {
          jsx: true
        }
      },
      globals: globals.browser
    },
    plugins: {
      '@typescript-eslint': tsEslint,
      vue: pluginVue,
      prettier: prettierPlugin,
      'import-x': importPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal'],
          pathGroups: [
            {
              pattern: '@/**',
              group: 'internal'
            }
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true
          }
        }
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase']
        },
        {
          selector: 'parameter',
          format: ['camelCase'],
          leadingUnderscore: 'allow'
        },
        {
          selector: 'memberLike',
          modifiers: ['private'],
          format: ['camelCase'],
          leadingUnderscore: 'require'
        },
        {
          selector: 'typeLike',
          format: ['PascalCase']
        }
      ],
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/no-multiple-template-root': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      quotes: ['error', 'single'],
      '@typescript-eslint/no-shadow': 'error',
      // The library never depends on its test skin or test helpers.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/tests/**', '**/tests', 'tests/**'],
              message: 'Library code must not import from tests/.'
            }
          ]
        }
      ]
    },
    ignores: [
      'build',
      'dist',
      'coverage',
      'node_modules',
      'public',
      'README.md',
      'CHANGELOG.md',
      'components.d.ts',
      'typed-router.d.ts',
      'auto-imports.d.ts',
      'vite.config.ts'
    ]
  }
]
