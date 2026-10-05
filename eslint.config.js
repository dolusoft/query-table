import process from 'node:process'

import importPlugin from 'eslint-plugin-import-x'
import prettierPlugin from 'eslint-plugin-prettier'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import vueEslintParser from 'vue-eslint-parser'

export default defineConfig([
  globalIgnores([
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
  ]),
  {
    files: ['**/*.{js,ts,vue}'],
    extends: [pluginVue.configs['flat/base']],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.vue']
      },
      globals: globals.browser
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
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
    }
  },
  {
    // Vue SFCs: vue-eslint-parser reads the template and hands <script> to
    // the TypeScript parser.
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueEslintParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: ['.vue']
      }
    }
  }
])
