import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        performance: 'readonly',
        require: 'readonly'
      }
    },
    rules: {
      // Enforce consistent indentation (2 spaces)
      'indent': ['error', 2],
      
      // Enforce consistent line endings
      'linebreak-style': ['error', 'unix'],
      
      // Enforce consistent quote usage (single quotes)
      'quotes': ['error', 'single'],
      
      // Require semicolons
      'semi': ['error', 'always'],
      
      // Disallow unused variables (warn instead of error for now)
      'no-unused-vars': ['warn', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '.*'
      }],
      
      // Disallow console statements in production (warn for development)
      'no-console': 'off',
      
      // Prefer const over let when variables are never reassigned
      'prefer-const': 'error',
      
      // Disallow var declarations
      'no-var': 'error',
      
      // Require space before function parentheses
      'space-before-function-paren': ['error', {
        'anonymous': 'always',
        'named': 'never',
        'asyncArrow': 'always'
      }],
      
      // Enforce trailing commas
      'comma-dangle': ['error', 'never'],
      
      // Disallow multiple empty lines
      'no-multiple-empty-lines': ['error', { max: 2, maxEOF: 1 }],
      
      // Require space around operators
      'space-infix-ops': 'error',
      
      // Require space before blocks
      'space-before-blocks': 'error'
    }
  },
  {
    // Test files configuration
    files: ['**/*.test.js', '**/*.spec.js', 'tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly'
      }
    }
  },
  {
    // Ignore patterns
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.min.js'
    ]
  }
];