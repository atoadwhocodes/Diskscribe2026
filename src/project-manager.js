/**
 * Project Manager for PC-98 Translation Projects
 * 
 * Handles saving and loading translation projects with full metadata.
 * Projects are stored as JSON and can be versioned, diffed, and shared.
 * 
 * @module project-manager
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Translation project schema (JSON structure)
 * @typedef {Object} TranslationProject
 * @property {Object} metadata - Project metadata
 * @property {Object} config - Project configuration
 * @property {Array} strings - Array of translated strings with metadata
 */

class ProjectManager {
  constructor(projectPath = null) {
    this.projectPath = projectPath;
    this.project = null;
    this.isDirty = false;
  }

  /**
   * Create a new translation project
   * @param {string} name - Project name
   * @param {string} gameId - Game identifier (e.g., 'alshark-pc98')
   * @param {string} sourceLanguage - Source language code (e.g., 'ja')
   * @param {string} targetLanguage - Target language code (e.g., 'en')
   * @returns {Object} New project object
   */
  createProject(name, gameId, sourceLanguage = 'ja', targetLanguage = 'en') {
    const timestamp = new Date().toISOString();
    
    this.project = {
      // Project metadata
      metadata: {
        version: '1.0.0',
        name: name,
        gameId: gameId,
        sourceLanguage: sourceLanguage,
        targetLanguage: targetLanguage,
        created: timestamp,
        modified: timestamp,
        author: 'DiskScribe2026',
        description: `Translation project for ${name}`,
        tags: [gameId, sourceLanguage, targetLanguage]
      },

      // Configuration
      config: {
        patchProfile: gameId,  // Which constraint profile to use
        creationType: 'alshark-pc98',  // Always Alshark for now
        encoding: 'shift_jis',  // PC-98 encoding
        preserveNewlines: true,
        aggressiveReflow: false,  // Don't truncate by default
        backupBeforePatch: true,  // Always backup
        verifyAfterPatch: true  // Always verify
      },

      // Statistics (auto-calculated)
      statistics: {
        totalStrings: 0,
        translated: 0,
        verified: 0,
        withWarnings: 0,
        byCategory: {},
        byDisk: {}
      },

      // Output files (for tracking)
      output: {
        patchedDisks: [],
        backups: [],
        lastPatchTime: null
      },

      // The actual translation data
      strings: []
    };

    this.isDirty = true;
    return this.project;
  }

  /**
   * Add strings to project from extraction data
   * @param {Array} extractedStrings - Array of extracted strings from extractor
   */
  addStringsFromExtraction(extractedStrings) {
    if (!this.project) {
      throw new Error('No project loaded. Call createProject() first.');
    }

    // Convert extraction format to project format
    this.project.strings = extractedStrings.map((str, idx) => ({
      id: `s_${String(idx).padStart(6, '0')}`,
      disk: str.disk,
      offset: str.offset,
      offsetHex: str.offsetHex || `0x${parseInt(str.offset, 16).toString(16).padStart(6, '0')}`,
      originalBytes: str.originalBytes || [],
      original: str.originalText,
      translation: str.translation || '',
      wrapped: str.wrapped || '',
      wrappedLines: str.wrappedLines || [],
      category: str.category,
      encoding: str.encoding || 'shift_jis',
      isJapanese: str.isJapanese || true,
      verified: false,
      reflowStatus: str.reflowStatus || 'not_checked',
      warnings: [],
      notes: ''
    }));

    this.updateStatistics();
    this.isDirty = true;
  }

  /**
   * Update a single string's translation
   * @param {string} stringId - String ID (s_000123)
   * @param {string} translation - New English translation
   * @param {string} wrapped - Wrapped version (optional)
   * @param {boolean} verified - Mark as verified
   */
  updateString(stringId, translation, wrapped = null, verified = false) {
    if (!this.project) throw new Error('No project loaded');

    const idx = this.project.strings.findIndex(s => s.id === stringId);
    if (idx < 0) throw new Error(`String not found: ${stringId}`);

    const str = this.project.strings[idx];
    str.translation = translation;
    str.wrapped = wrapped || translation;
    str.verified = verified;
    str.modified = new Date().toISOString();

    this.updateStatistics();
    this.isDirty = true;
  }

  /**
   * Mark strings as needing review
   * @param {Array} stringIds - Array of string IDs
   * @param {string} warning - Warning message
   */
  addWarning(stringIds, warning) {
    if (!this.project) throw new Error('No project loaded');

    stringIds.forEach(id => {
      const str = this.project.strings.find(s => s.id === id);
      if (str && !str.warnings.includes(warning)) {
        str.warnings.push(warning);
      }
    });

    this.isDirty = true;
  }

  /**
   * Calculate project statistics
   */
  updateStatistics() {
    if (!this.project) return;

    const stats = {
      totalStrings: this.project.strings.length,
      translated: 0,
      verified: 0,
      withWarnings: 0,
      byCategory: {},
      byDisk: {}
    };

    this.project.strings.forEach(str => {
      // Count translations
      if (str.translation && str.translation !== str.original) {
        stats.translated++;
      }
      if (str.verified) {
        stats.verified++;
      }
      if (str.warnings.length > 0) {
        stats.withWarnings++;
      }

      // Count by category
      if (!stats.byCategory[str.category]) {
        stats.byCategory[str.category] = { total: 0, translated: 0, verified: 0 };
      }
      stats.byCategory[str.category].total++;
      if (str.translation && str.translation !== str.original) {
        stats.byCategory[str.category].translated++;
      }
      if (str.verified) {
        stats.byCategory[str.category].verified++;
      }

      // Count by disk
      if (!stats.byDisk[str.disk]) {
        stats.byDisk[str.disk] = { total: 0, translated: 0, verified: 0 };
      }
      stats.byDisk[str.disk].total++;
      if (str.translation && str.translation !== str.original) {
        stats.byDisk[str.disk].translated++;
      }
      if (str.verified) {
        stats.byDisk[str.disk].verified++;
      }
    });

    this.project.statistics = stats;
    this.project.metadata.modified = new Date().toISOString();

    return stats;
  }

  /**
   * Validate project integrity
   * @returns {Object} Validation result with errors/warnings
   */
  validate() {
    if (!this.project) throw new Error('No project loaded');

    const result = {
      isValid: true,
      errors: [],
      warnings: []
    };

    // Check metadata
    if (!this.project.metadata.name) {
      result.errors.push('Project missing name');
      result.isValid = false;
    }
    if (!this.project.metadata.gameId) {
      result.errors.push('Project missing gameId');
      result.isValid = false;
    }

    // Check strings
    if (this.project.strings.length === 0) {
      result.warnings.push('Project has no strings');
    }

    // Check for orphaned translations
    this.project.strings.forEach(str => {
      if (str.translation && !str.wrapped) {
        result.warnings.push(`String ${str.id}: has translation but no wrapped version`);
      }
      if (str.reflowStatus === 'overflow') {
        result.warnings.push(`String ${str.id}: overflow in wrapped text`);
      }
    });

    // Check statistics consistency
    const translatedCount = this.project.strings.filter(s => s.translation).length;
    if (translatedCount !== this.project.statistics.translated) {
      result.warnings.push('Statistics mismatch: recalculate with updateStatistics()');
    }

    return result;
  }

  /**
   * Save project to JSON file
   * @param {string} filePath - Path to save file
   * @returns {string} File path where saved
   */
  save(filePath = null) {
    if (!this.project) throw new Error('No project to save');

    const savePath = filePath || this.projectPath;
    if (!savePath) throw new Error('No save path provided');

    // Update modified time
    this.project.metadata.modified = new Date().toISOString();

    // Validate before saving
    const validation = this.validate();
    if (!validation.isValid) {
      throw new Error('Project validation failed: ' + validation.errors.join(', '));
    }

    // Add integrity hash
    this.project.metadata.checksum = this._calculateChecksum();

    // Ensure directory exists
    const dir = path.dirname(savePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(
      savePath,
      JSON.stringify(this.project, null, 2),
      'utf-8'
    );

    this.projectPath = savePath;
    this.isDirty = false;

    return savePath;
  }

  /**
   * Load project from JSON file
   * @param {string} filePath - Path to project file
   * @returns {Object} Loaded project
   */
  load(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Project file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    this.project = JSON.parse(content);

    // Verify checksum
    const savedChecksum = this.project.metadata.checksum;
    const calculatedChecksum = this._calculateChecksum();
    
    if (savedChecksum && savedChecksum !== calculatedChecksum) {
      throw new Error('Project file integrity check failed (checksum mismatch)');
    }

    this.projectPath = filePath;
    this.isDirty = false;

    return this.project;
  }

  /**
   * Export project data in various formats
   * @param {string} format - 'json', 'csv', 'tsv'
   * @param {Object} options - Export options
   * @returns {string} Formatted export
   */
  export(format = 'json', options = {}) {
    if (!this.project) throw new Error('No project to export');

    switch (format) {
      case 'json':
        return JSON.stringify(this.project, null, 2);

      case 'csv':
        return this._exportCSV(options);

      case 'tsv':
        return this._exportTSV(options);

      case 'translation-only':
        return this._exportTranslationOnly(options);

      default:
        throw new Error(`Unknown export format: ${format}`);
    }
  }

  /**
   * Export as CSV
   */
  _exportCSV(options = {}) {
    const { includeOriginal = true, includeWrapped = true, onlyVerified = false } = options;

    let rows = [];
    
    // Header
    const headers = ['ID', 'Disk', 'Offset', 'Category'];
    if (includeOriginal) headers.push('Original');
    headers.push('English');
    if (includeWrapped) headers.push('Wrapped');
    headers.push('Status', 'Verified');
    
    rows.push(headers.map(this._escapeCSV).join(','));

    // Data rows
    const strings = onlyVerified ? 
      this.project.strings.filter(s => s.verified) : 
      this.project.strings;

    strings.forEach(str => {
      const row = [
        str.id,
        str.disk,
        str.offset,
        str.category
      ];
      if (includeOriginal) row.push(str.original);
      row.push(str.translation);
      if (includeWrapped) row.push(str.wrapped);
      row.push(str.reflowStatus);
      row.push(str.verified ? 'Yes' : 'No');

      rows.push(row.map(this._escapeCSV).join(','));
    });

    return rows.join('\n');
  }

  /**
   * Export as TSV
   */
  _exportTSV(options = {}) {
    // Similar to CSV but with tabs
    return this._exportCSV(options).replace(/,/g, '\t');
  }

  /**
   * Export translation strings only
   */
  _exportTranslationOnly(options = {}) {
    const { onlyVerified = false } = options;
    
    const strings = onlyVerified ? 
      this.project.strings.filter(s => s.verified) : 
      this.project.strings;

    return strings.map(str => ({
      original: str.original,
      translation: str.translation,
      wrapped: str.wrapped
    }));
  }

  /**
   * Get project summary
   * @returns {string} Human-readable project summary
   */
  getSummary() {
    if (!this.project) return 'No project loaded';

    const meta = this.project.metadata;
    const stats = this.project.statistics;
    const pct = stats.totalStrings > 0 ? Math.round((stats.translated / stats.totalStrings) * 100) : 0;

    return `
╔════════════════════════════════════════════════════════════════╗
║ ${meta.name.padEnd(62)} ║
╠════════════════════════════════════════════════════════════════╣
║ Game:        ${meta.gameId.padEnd(57)} ║
║ Languages:   ${meta.sourceLanguage} → ${meta.targetLanguage}${' '.repeat(52 - meta.sourceLanguage.length - meta.targetLanguage.length)} ║
║ Created:     ${meta.created.split('T')[0].padEnd(57)} ║
║ Modified:    ${meta.modified.split('T')[0].padEnd(57)} ║
╠════════════════════════════════════════════════════════════════╣
║ Total:       ${String(stats.totalStrings).padEnd(57)} ║
║ Translated:  ${stats.translated} / ${stats.totalStrings} (${pct}%)${' '.repeat(52 - String(stats.translated).length - String(stats.totalStrings).length - String(pct).length)} ║
║ Verified:    ${stats.verified} / ${stats.totalStrings}${' '.repeat(57 - String(stats.verified).length - String(stats.totalStrings).length)} ║
║ Warnings:    ${stats.withWarnings}${' '.repeat(57 - String(stats.withWarnings).length)} ║
╚════════════════════════════════════════════════════════════════╝
`;
  }

  /**
   * Calculate checksum for integrity verification
   */
  _calculateChecksum() {
    if (!this.project) return null;

    // Create checksum from strings only (not metadata)
    const dataToHash = JSON.stringify(this.project.strings);
    return crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Escape CSV values
   */
  _escapeCSV(value) {
    if (typeof value !== 'string') value = String(value);
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Get project as JSON string
   */
  toJSON() {
    return JSON.stringify(this.project, null, 2);
  }

  /**
   * Get project as object
   */
  toObject() {
    return this.project;
  }
}

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ProjectManager };
}
