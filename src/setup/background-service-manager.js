/**
 * Background Service Manager - Manages launchd background export service
 *
 * Handles installation, uninstallation, and status checking of the
 * background export service that runs every minute.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
const execAsync = promisify(exec);

export class BackgroundServiceManager {
  constructor(options = {}) {
    this.plistName = 'com.claude.conversation-exporter';
    this.plistPath = join(homedir(), 'Library', 'LaunchAgents', `${this.plistName}.plist`);
    this.projectRoot = options.projectRoot || process.cwd();
    this.exportScript = join(this.projectRoot, 'scripts', 'background-export.sh');
    this.logger = options.logger || console;
  }

  /**
   * Check if the background service is installed
   * @returns {Promise<boolean>}
   */
  async isServiceInstalled() {
    return existsSync(this.plistPath);
  }

  /**
   * Check if the background service is running
   * @returns {Promise<boolean>}
   */
  async isServiceRunning() {
    try {
      const { stdout } = await execAsync(`launchctl list | grep ${this.plistName}`);
      return stdout.trim().length > 0;
    } catch (error) {
      // grep returns exit code 1 when no match found
      return false;
    }
  }

  /**
   * Get service status information
   * @returns {Promise<{installed: boolean, running: boolean, scriptExists: boolean, logPaths: object}>}
   */
  async getServiceStatus() {
    const installed = await this.isServiceInstalled();
    const running = installed ? await this.isServiceRunning() : false;
    const scriptExists = existsSync(this.exportScript);

    const logDir = join(homedir(), '.claude', 'claude_conversations', 'logs');

    return {
      installed,
      running,
      scriptExists,
      plistPath: this.plistPath,
      exportScript: this.exportScript,
      logPaths: {
        timing: join(logDir, 'background-export-timing.log'),
        stats: join(logDir, 'background-export-stats.log'),
        stdout: join(logDir, 'background-export-stdout.log'),
        stderr: join(logDir, 'background-export-stderr.log')
      }
    };
  }

  /**
   * Install the background export service
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installService() {
    try {
      // Check if script exists
      if (!existsSync(this.exportScript)) {
        return {
          success: false,
          message: `Export script not found: ${this.exportScript}`
        };
      }

      // Make script executable
      await execAsync(`chmod +x "${this.exportScript}"`);

      // Run the installation script
      const installScript = join(this.projectRoot, 'scripts', 'install-background-export.sh');

      if (!existsSync(installScript)) {
        return {
          success: false,
          message: `Installation script not found: ${installScript}`
        };
      }

      await execAsync(`chmod +x "${installScript}"`);
      const { stdout, stderr } = await execAsync(`"${installScript}"`);

      // Check if it actually installed
      const status = await this.getServiceStatus();
      if (status.installed && status.running) {
        return {
          success: true,
          message: 'Background export service installed and running! Exports every 60 seconds.',
          stdout
        };
      } else {
        return {
          success: false,
          message: 'Installation script ran but service not active. Check logs.',
          stdout,
          stderr
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to install service: ${error.message}`,
        error: error.stderr || error.message
      };
    }
  }

  /**
   * Uninstall the background export service
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallService() {
    try {
      // Run the uninstallation script
      const uninstallScript = join(this.projectRoot, 'scripts', 'uninstall-background-export.sh');

      if (!existsSync(uninstallScript)) {
        return {
          success: false,
          message: 'Uninstallation script not found: ' + uninstallScript
        };
      }

      await execAsync(`chmod +x "${uninstallScript}"`);
      const { stdout } = await execAsync(`"${uninstallScript}"`);

      // Check if it actually uninstalled
      const status = await this.getServiceStatus();
      if (!status.installed && !status.running) {
        return {
          success: true,
          message: 'Background export service uninstalled successfully!',
          stdout
        };
      } else {
        return {
          success: false,
          message: 'Uninstallation script ran but service still active.',
          stdout
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to uninstall service: ${error.message}`,
        error: error.stderr || error.message
      };
    }
  }

  /**
   * Get recent service statistics
   * @returns {Promise<object>}
   */
  async getRecentStats() {
    const status = await this.getServiceStatus();

    if (!status.installed) {
      return {
        installed: false,
        stats: null
      };
    }

    try {
      const statsPath = status.logPaths.stats;
      if (!existsSync(statsPath)) {
        return {
          installed: true,
          stats: null,
          message: 'No stats available yet (service may not have run)'
        };
      }

      // Parse last run summary from stats log
      const { stdout } = await execAsync(`tail -20 "${statsPath}"`);
      const lines = stdout.split('\n');

      const stats = {
        lastRun: null,
        totalTime: null,
        activeFiles: 0,
        exported: 0,
        skipped: 0,
        errors: 0
      };

      // Parse the summary section
      for (const line of lines) {
        if (line.includes('RUN SUMMARY')) {
          stats.lastRun = line.match(/\[(.*?)\]/)?.[1];
        } else if (line.includes('Total time:')) {
          stats.totalTime = line.match(/(\d+)ms/)?.[1] + 'ms';
        } else if (line.includes('Active files:')) {
          stats.activeFiles = parseInt(line.match(/Active files:\s*(\d+)/)?.[1] || '0');
        } else if (line.includes('Exported:')) {
          stats.exported = parseInt(line.match(/Exported:\s*(\d+)/)?.[1] || '0');
        } else if (line.includes('Skipped:')) {
          stats.skipped = parseInt(line.match(/Skipped:\s*(\d+)/)?.[1] || '0');
        } else if (line.includes('Errors:')) {
          stats.errors = parseInt(line.match(/Errors:\s*(\d+)/)?.[1] || '0');
        }
      }

      return {
        installed: true,
        stats
      };
    } catch (error) {
      return {
        installed: true,
        stats: null,
        error: error.message
      };
    }
  }
}

export default BackgroundServiceManager;
