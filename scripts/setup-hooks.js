#!/usr/bin/env node

/**
 * Setup Git hooks for the project
 * This script installs a pre-commit hook that runs tests and linting
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const gitHooksDir = path.join(projectRoot, '.git', 'hooks');
const preCommitPath = path.join(gitHooksDir, 'pre-commit');

const preCommitHook = `#!/bin/sh
# Pre-commit hook for Claude Conversation Extractor
# Runs linting and tests before allowing commit

echo "🔍 Running pre-commit checks..."

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found. Are you in the project root?"
    exit 1
fi

# Run linting
echo "📝 Checking code style..."
npm run lint
LINT_EXIT=$?

if [ $LINT_EXIT -ne 0 ]; then
    echo "❌ Linting failed! Please fix the issues above."
    echo "   Run 'npm run lint:fix' to auto-fix some issues."
    exit 1
fi

echo "✅ Linting passed"

# Run quick tests (only essential tests for speed)
echo "🧪 Running tests..."
npm run test:quick
TEST_EXIT=$?

if [ $TEST_EXIT -ne 0 ]; then
    echo "❌ Tests failed! Please fix the failing tests."
    echo "   Run 'npm test' to see all test results."
    exit 1
fi

echo "✅ Tests passed"
echo "✨ All pre-commit checks passed! Proceeding with commit..."
`;

async function setupHooks() {
  console.log('🔧 Setting up Git hooks...\n');

  try {
    // Check if .git directory exists
    const gitDir = path.join(projectRoot, '.git');
    if (!await fs.exists(gitDir)) {
      console.error('❌ Error: .git directory not found.');
      console.error('   This script must be run from a Git repository.');
      process.exit(1);
    }

    // Ensure hooks directory exists
    await fs.ensureDir(gitHooksDir);

    // Check if pre-commit hook already exists
    if (await fs.exists(preCommitPath)) {
      console.log('⚠️  A pre-commit hook already exists.');
      console.log('   Backing up existing hook to pre-commit.backup');
      await fs.copy(preCommitPath, `${preCommitPath}.backup`);
    }

    // Write the pre-commit hook
    await fs.writeFile(preCommitPath, preCommitHook);
    
    // Make it executable (Unix-like systems)
    await fs.chmod(preCommitPath, '755');

    console.log('✅ Pre-commit hook installed successfully!\n');
    console.log('📋 The hook will run before each commit and:');
    console.log('   1. Check code style with ESLint');
    console.log('   2. Run essential tests (quick test suite)');
    console.log('   3. Block the commit if any checks fail\n');
    console.log('💡 Tips:');
    console.log('   - Run "npm run lint:fix" to auto-fix style issues');
    console.log('   - Run "npm test" to run all tests');
    console.log('   - Use "git commit --no-verify" to skip hooks (not recommended)');
    
  } catch (error) {
    console.error('❌ Error setting up hooks:', error.message);
    process.exit(1);
  }
}

// Run the setup
setupHooks();