/**
 * Smoke tests that actually run the CLI to catch runtime errors
 * These tests spawn the actual process to ensure basic functionality works
 */

import { spawn } from 'child_process';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { writeFile, mkdir, rm } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

describe('Smoke Tests - Actual CLI Execution', () => {
  const testProjectDir = join(homedir(), '.claude', 'projects', 'test-smoke');
  const testConversation = {
    role: 'user',
    content: 'Test message for smoke test'
  };

  beforeAll(async () => {
    // Create test conversation
    await mkdir(testProjectDir, { recursive: true });
    await writeFile(
      join(testProjectDir, 'conversation.jsonl'),
      JSON.stringify(testConversation)
    );
  });

  afterAll(async () => {
    // Cleanup
    await rm(testProjectDir, { recursive: true, force: true });
  });

  it('should start without crashing', (done) => {
    const cli = spawn('node', ['src/cli.js'], {
      env: { ...process.env, CI: 'true' }
    });

    let output = '';
    let errorOutput = '';
    let crashed = false;

    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    cli.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // Only detect actual JavaScript errors, not just the word "Error" in output
      const errorText = data.toString();
      if (errorText.includes('Error:') || 
          errorText.includes('ReferenceError') ||
          errorText.includes('TypeError') ||
          errorText.includes('is not defined')) {
        crashed = true;
      }
    });

    // Give it 5 seconds to start and display initial screen
    // (getSetupStatus now reads index file which can be slow)
    setTimeout(() => {
      cli.kill('SIGTERM');
    }, 5000);

    cli.on('exit', (code) => {
      // Check for common crash indicators
      expect(crashed).toBe(false);
      expect(errorOutput).not.toContain('is not defined');
      expect(errorOutput).not.toContain('ReferenceError');
      expect(errorOutput).not.toContain('TypeError');
      expect(errorOutput).not.toContain('Uncaught Exception');
      
      // Should show some expected output
      expect(output.length).toBeGreaterThan(0);
      done();
    });
  }, 15000); // Increased timeout for status check that reads index file

  it('should handle search input without crashing', (done) => {
    const cli = spawn('node', ['src/cli.js'], {
      env: { ...process.env, CI: 'true' }
    });

    let output = '';
    let errorOutput = '';
    let crashed = false;

    cli.stdout.on('data', (data) => {
      output += data.toString();
    });

    cli.stderr.on('data', (data) => {
      errorOutput += data.toString();
      // Check for actual error indicators
      const errorText = data.toString();
      if (errorText.includes('Error:') || 
          errorText.includes('ReferenceError') ||
          errorText.includes('TypeError') ||
          errorText.includes('is not defined') ||
          errorText.includes('Cannot read') ||
          errorText.includes('Uncaught')) {
        crashed = true;
      }
    });

    // Wait for startup then send some input to simulate search
    setTimeout(() => {
      // Send Escape key first to potentially enter search mode
      cli.stdin.write('\u001b');
      setTimeout(() => {
        cli.stdin.write('test search');
      }, 100);
    }, 1500);

    setTimeout(() => {
      cli.kill('SIGTERM');
    }, 3500);

    cli.on('exit', () => {
      // Log outputs for debugging
      if (crashed) {
        console.log('STDOUT:', output.slice(0, 500));
        console.log('STDERR:', errorOutput.slice(0, 500));
      }
      expect(crashed).toBe(false);
      expect(errorOutput).not.toContain('is not defined');
      expect(errorOutput).not.toContain('ReferenceError');
      expect(errorOutput).not.toContain('TypeError');
      done();
    });
  }, 6000);
});