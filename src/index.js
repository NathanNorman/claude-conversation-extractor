/**
 * Claude Conversation Extractor
 * Main entry point for library usage
 */

// Export main components for programmatic use
export { default as ExportManager } from './export/export-manager.js';
export { default as MarkdownExporter } from './export/markdown-exporter.js';
export { default as JsonExporter } from './export/json-exporter.js';
export { default as HtmlExporter } from './export/html-exporter.js';
export { default as MiniSearchEngine } from './search/minisearch-engine.js';
export { IndexedSearch } from './search/indexed-search.js';
export { default as SetupManager } from './setup/setup-manager.js';
export { BulkExtractor } from './setup/bulk-extractor.js';
export { default as IndexBuilder } from './setup/index-builder.js';

// Export utilities
export * from './utils/date-filters.js';

// Package info
export const version = '1.1.2';