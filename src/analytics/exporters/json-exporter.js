/**
 * JSON Exporter
 *
 * Exports analytics data in JSON format for machine-readable analysis.
 * Preserves full data structure for programmatic access.
 */

import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

/**
 * Export analytics cache to JSON file
 * @param {Object} cache - Analytics cache
 * @param {Object} options - Export options
 * @returns {Promise<string>} Path to exported file
 */
export async function exportToJSON(cache, options = {}) {
  const {
    outputDir = './',
    filename = 'analytics-export.json',
    pretty = true,
    includeTimestamp = true
  } = options;

  // Create export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: cache.version || 2,
    data: cache
  };

  // Format JSON
  const jsonContent = pretty
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);

  // Generate filename with timestamp if requested
  const finalFilename = includeTimestamp
    ? filename.replace('.json', `-${Date.now()}.json`)
    : filename;

  const outputPath = join(outputDir, finalFilename);

  // Ensure directory exists
  await mkdir(outputDir, { recursive: true });

  // Write file
  await writeFile(outputPath, jsonContent, 'utf8');

  return outputPath;
}

/**
 * Export specific analytics section to JSON
 * @param {Object} cache - Analytics cache
 * @param {string} section - Section to export ('overview', 'timePatterns', etc.)
 * @param {Object} options - Export options
 * @returns {Promise<string>} Path to exported file
 */
export async function exportSectionToJSON(cache, section, options = {}) {
  const {
    outputDir = './',
    filename = `analytics-${section}.json`,
    pretty = true
  } = options;

  if (!cache[section]) {
    throw new Error(`Section '${section}' not found in analytics cache`);
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    section,
    data: cache[section]
  };

  const jsonContent = pretty
    ? JSON.stringify(exportData, null, 2)
    : JSON.stringify(exportData);

  const outputPath = join(outputDir, filename);
  await writeFile(outputPath, jsonContent, 'utf8');

  return outputPath;
}

/**
 * Export analytics as compact JSON (no pretty printing, no timestamp)
 * @param {Object} cache - Analytics cache
 * @param {string} outputPath - Full output path
 * @returns {Promise<string>} Path to exported file
 */
export async function exportCompactJSON(cache, outputPath) {
  const jsonContent = JSON.stringify(cache);
  await writeFile(outputPath, jsonContent, 'utf8');
  return outputPath;
}
