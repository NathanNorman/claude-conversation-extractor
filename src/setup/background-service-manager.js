/**
 * Background Service Manager - Manages launchd background services
 *
 * Handles installation, uninstallation, and status checking of two services:
 * 1. Export service (every 60s) - Fast JSONL export
 * 2. Index updater (every 15min) - Search index updates
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
const execAsync = promisify(exec);

export class BackgroundServiceManager {
  constructor(options = {}) {
    this.projectRoot = options.projectRoot || process.cwd();
    this.logger = options.logger || console;

    // Export service (every 60s)
    this.exportService = {
      name: 'com.claude.conversation-exporter',
      plistPath: join(homedir(), 'Library', 'LaunchAgents', 'com.claude.conversation-exporter.plist'),
      scriptPath: join(this.projectRoot, 'scripts', 'background-export.sh'),
      interval: '60s',
      description: 'Fast conversation export'
    };

    // Index updater service (every hour)
    this.indexService = {
      name: 'com.claude.index-updater',
      plistPath: join(homedir(), 'Library', 'LaunchAgents', 'com.claude.index-updater.plist'),
      scriptPath: join(this.projectRoot, 'scripts', 'update-search-index.sh'),
      interval: '1 hour',
      description: 'Search index updates'
    };
  }

  /**
   * Check if a specific service is installed
   * @param {object} service - Service config (exportService or indexService)
   * @returns {boolean}
   */
  isServiceInstalled(service) {
    return existsSync(service.plistPath);
  }

  /**
   * Check if a specific service is running
   * @param {object} service - Service config
   * @returns {Promise<boolean>}
   */
  async isServiceRunning(service) {
    try {
      const { stdout } = await execAsync(`launchctl list | grep ${service.name}`);
      return stdout.trim().length > 0;
    } catch (error) {
      // grep returns exit code 1 when no match found
      return false;
    }
  }

  /**
   * Get status for both services
   * @returns {Promise<{export: object, index: object}>}
   */
  async getServiceStatus() {
    const logDir = join(homedir(), '.claude', 'claude_conversations', 'logs');

    const exportStatus = {
      installed: this.isServiceInstalled(this.exportService),
      running: false,
      scriptExists: existsSync(this.exportService.scriptPath),
      name: 'Export Service',
      description: this.exportService.description,
      interval: this.exportService.interval,
      logPaths: {
        timing: join(logDir, 'background-export-timing.log'),
        stats: join(logDir, 'background-export-stats.log'),
        stdout: join(logDir, 'background-export-stdout.log'),
        stderr: join(logDir, 'background-export-stderr.log')
      }
    };

    const indexStatus = {
      installed: this.isServiceInstalled(this.indexService),
      running: false,
      scriptExists: existsSync(this.indexService.scriptPath),
      name: 'Index Updater',
      description: this.indexService.description,
      interval: this.indexService.interval,
      logPaths: {
        timing: join(logDir, 'index-update-timing.log'),
        stats: join(logDir, 'index-update-stats.log'),
        stdout: join(logDir, 'index-update-stdout.log'),
        stderr: join(logDir, 'index-update-stderr.log')
      }
    };

    // Check running status if installed
    if (exportStatus.installed) {
      exportStatus.running = await this.isServiceRunning(this.exportService);
    }
    if (indexStatus.installed) {
      indexStatus.running = await this.isServiceRunning(this.indexService);
    }

    return {
      export: exportStatus,
      index: indexStatus,
      // Legacy fields for backward compatibility
      installed: exportStatus.installed && indexStatus.installed,
      running: exportStatus.running && indexStatus.running,
      scriptExists: exportStatus.scriptExists && indexStatus.scriptExists
    };
  }

  /**
   * Install both services (export + index)
   * @returns {Promise<{success: boolean, message: string, results: object}>}
   */
  async installService() {
    const results = {
      export: null,
      index: null
    };

    // Install export service
    results.export = await this.installExportService();

    // Install index service
    results.index = await this.installIndexService();

    const bothSucceeded = results.export.success && results.index.success;
    const neitherSucceeded = !results.export.success && !results.index.success;

    if (bothSucceeded) {
      return {
        success: true,
        message: '✅ Both services installed successfully!\n' +
                 `  • Export Service: Running every ${this.exportService.interval}\n` +
                 `  • Index Updater: Running every ${this.indexService.interval}`,
        results
      };
    } else if (neitherSucceeded) {
      return {
        success: false,
        message: '❌ Failed to install both services.\n' +
                 `  • Export: ${results.export.message}\n` +
                 `  • Index: ${results.index.message}`,
        results
      };
    } else {
      return {
        success: false,
        message: '⚠️  Partial installation (one service failed).\n' +
                 `  • Export: ${results.export.success ? '✅' : '❌'} ${results.export.message}\n` +
                 `  • Index: ${results.index.success ? '✅' : '❌'} ${results.index.message}`,
        results
      };
    }
  }

  /**
   * Install export service only
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installExportService() {
    try {
      // Check if script exists
      if (!existsSync(this.exportService.scriptPath)) {
        return {
          success: false,
          message: `Script not found: ${this.exportService.scriptPath}`
        };
      }

      // Make script executable
      await execAsync(`chmod +x "${this.exportService.scriptPath}"`);

      // Load the plist
      await execAsync(`launchctl load "${this.exportService.plistPath}"`);

      // Verify it's running
      const running = await this.isServiceRunning(this.exportService);
      if (running) {
        return {
          success: true,
          message: `Started (every ${this.exportService.interval})`
        };
      } else {
        return {
          success: false,
          message: 'Loaded but not running'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Install index service only
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async installIndexService() {
    try {
      // Check if script exists
      if (!existsSync(this.indexService.scriptPath)) {
        return {
          success: false,
          message: `Script not found: ${this.indexService.scriptPath}`
        };
      }

      // Make script executable
      await execAsync(`chmod +x "${this.indexService.scriptPath}"`);

      // Load the plist
      await execAsync(`launchctl load "${this.indexService.plistPath}"`);

      // Verify it's running
      const running = await this.isServiceRunning(this.indexService);
      if (running) {
        return {
          success: true,
          message: `Started (every ${this.indexService.interval})`
        };
      } else {
        return {
          success: false,
          message: 'Loaded but not running'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Uninstall both services
   * @returns {Promise<{success: boolean, message: string, results: object}>}
   */
  async uninstallService() {
    const results = {
      export: null,
      index: null
    };

    // Uninstall export service
    results.export = await this.uninstallExportService();

    // Uninstall index service
    results.index = await this.uninstallIndexService();

    const bothSucceeded = results.export.success && results.index.success;
    const neitherSucceeded = !results.export.success && !results.index.success;

    if (bothSucceeded) {
      return {
        success: true,
        message: '✅ Both services uninstalled successfully!',
        results
      };
    } else if (neitherSucceeded) {
      return {
        success: false,
        message: '❌ Failed to uninstall both services.\n' +
                 `  • Export: ${results.export.message}\n` +
                 `  • Index: ${results.index.message}`,
        results
      };
    } else {
      return {
        success: false,
        message: '⚠️  Partial uninstallation (one service failed).\n' +
                 `  • Export: ${results.export.success ? '✅' : '❌'} ${results.export.message}\n` +
                 `  • Index: ${results.index.success ? '✅' : '❌'} ${results.index.message}`,
        results
      };
    }
  }

  /**
   * Uninstall export service only
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallExportService() {
    try {
      // Unload the plist
      await execAsync(`launchctl unload "${this.exportService.plistPath}"`);

      // Verify it's stopped
      const running = await this.isServiceRunning(this.exportService);
      if (!running) {
        return {
          success: true,
          message: 'Stopped successfully'
        };
      } else {
        return {
          success: false,
          message: 'Unloaded but still running'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Uninstall index service only
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async uninstallIndexService() {
    try {
      // Unload the plist
      await execAsync(`launchctl unload "${this.indexService.plistPath}"`);

      // Verify it's stopped
      const running = await this.isServiceRunning(this.indexService);
      if (!running) {
        return {
          success: true,
          message: 'Stopped successfully'
        };
      } else {
        return {
          success: false,
          message: 'Unloaded but still running'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Get recent service statistics for both services
   * @returns {Promise<{export: object, index: object}>}
   */
  async getRecentStats() {
    const status = await this.getServiceStatus();

    const exportStats = await this._getExportStats(status.export);
    const indexStats = await this._getIndexStats(status.index);

    return {
      export: exportStats,
      index: indexStats
    };
  }

  /**
   * Get export service stats
   * @private
   */
  async _getExportStats(status) {
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
          message: 'No stats available yet'
        };
      }

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

  /**
   * Get index updater stats
   * @private
   */
  async _getIndexStats(status) {
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
          message: 'No stats available yet'
        };
      }

      const { stdout } = await execAsync(`tail -20 "${statsPath}"`);
      const lines = stdout.split('\n');

      const stats = {
        lastRun: null,
        totalTime: null
      };

      for (const line of lines) {
        if (line.includes('UPDATE SUMMARY')) {
          stats.lastRun = line.match(/\[(.*?)\]/)?.[1];
        } else if (line.includes('Total time:')) {
          stats.totalTime = line.match(/(\d+)ms/)?.[1] + 'ms';
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
