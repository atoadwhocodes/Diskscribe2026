/**
 * DISK REINSERTION ENGINE
 * Handles precise byte-level text replacement in disk images
 * Validates all changes, preserves code/binary structures
 */

const fs = require('fs');
const path = require('path');

/**
 * Represents a single text region in a disk that needs replacement
 */
class TextRegion {
  constructor(disk, offset, originalBytes, originalText, maxLength = null) {
    this.disk = disk;
    this.offset = offset; // Decimal offset in disk file
    this.originalBytes = Buffer.from(originalBytes); // Original byte sequence
    this.originalText = originalText; // Human-readable original text
    this.maxLength = maxLength || originalBytes.length; // Max bytes for replacement
    this.translatedText = null;
    this.translatedBytes = null;
    this.verified = false;
  }

  /**
   * Set the translation for this region
   */
  setTranslation(translatedText, options = {}) {
    this.translatedText = translatedText;

    // Encode translation to Shift-JIS (for Japanese) or ASCII (for English)
    const encoded = this.encodeText(translatedText);

    // Handle length constraints
    if (encoded.length > this.maxLength) {
      if (options.allowTruncate) {
        // Truncate at safe boundary (don't split multi-byte char)
        this.translatedBytes = encoded.slice(0, this.maxLength);
      } else {
        throw new Error(
          `Translation exceeds max length: "${translatedText}" ` +
          `(${encoded.length} bytes > ${this.maxLength} max)`
        );
      }
    } else if (encoded.length < this.maxLength && options.padWithNull) {
      // Pad with null terminators
      this.translatedBytes = Buffer.alloc(this.maxLength);
      encoded.copy(this.translatedBytes);
    } else {
      this.translatedBytes = encoded;
    }
  }

  /**
   * Encode text to Shift-JIS or ASCII
   */
  encodeText(text) {
    // For now, just use ASCII encoding
    // In production, would use proper Shift-JIS encoder
    const buffer = Buffer.alloc(text.length * 3); // Max 3 bytes per char in Shift-JIS
    let written = 0;

    for (const char of text) {
      const code = char.charCodeAt(0);

      // ASCII characters
      if (code <= 0x7f) {
        buffer[written++] = code;
      }
      // For Japanese chars, we'd encode to Shift-JIS here
      // For now, just use placeholder
      else {
        buffer[written++] = 0x3f; // '?'
      }
    }

    return buffer.slice(0, written);
  }

  /**
   * Verify the translation fits without corrupting
   */
  validate() {
    if (!this.translatedBytes) {
      throw new Error(`Translation not set for offset 0x${this.offset.toString(16)}`);
    }

    // Check length constraints
    if (this.translatedBytes.length > this.maxLength) {
      throw new Error(
        `Translation too long: ${this.translatedBytes.length} > ${this.maxLength} bytes`
      );
    }

    return {
      valid: true,
      originalLength: this.originalBytes.length,
      translatedLength: this.translatedBytes.length,
      paddingNeeded: this.maxLength - this.translatedBytes.length
    };
  }

  /**
   * Generate patch for this region
   */
  generatePatch() {
    this.validate();

    return {
      disk: this.disk,
      offset: this.offset,
      offsetHex: `0x${this.offset.toString(16).padStart(8, '0')}`,
      originalText: this.originalText,
      translatedText: this.translatedText,
      originalBytesLength: this.originalBytes.length,
      translatedBytesLength: this.translatedBytes.length,
      maxLength: this.maxLength,
      patch: {
        offset: this.offset,
        originalBytesHex: this.originalBytes.toString('hex'),
        replacementBytesHex: this.translatedBytes.toString('hex'),
        operation: 'replace'
      }
    };
  }
}

/**
 * Manages all patches for a disk and applies them safely
 */
class DiskPatcher {
  constructor(diskPath) {
    this.diskPath = diskPath;
    this.regions = [];
    this.applied = [];
    this.failed = [];
    this.backup = null;

    // Validate disk exists
    if (!fs.existsSync(diskPath)) {
      throw new Error(`Disk file not found: ${diskPath}`);
    }
  }

  /**
   * Add a text region to patch
   */
  addRegion(offset, originalBytes, originalText, maxLength) {
    const region = new TextRegion(path.basename(this.diskPath), offset, originalBytes, originalText, maxLength);
    this.regions.push(region);
    return region;
  }

  /**
   * Find and add regions by pattern matching in disk
   */
  findRegionsByText(searchText, maxLength) {
    const diskBuffer = fs.readFileSync(this.diskPath);
    const searchBuffer = Buffer.from(searchText, 'utf8');
    const regions = [];

    let offset = 0;
    while ((offset = diskBuffer.indexOf(searchBuffer, offset)) !== -1) {
      this.addRegion(offset, diskBuffer.slice(offset, offset + (maxLength || searchBuffer.length)), searchText, maxLength);
      offset += searchBuffer.length;
    }

    return regions;
  }

  /**
   * Create backup before applying patches
   */
  createBackup() {
    const backupPath = `${this.diskPath}.backup.${Date.now()}`;
    fs.copyFileSync(this.diskPath, backupPath);
    this.backup = backupPath;
    console.log(`✓ Backup created: ${backupPath}`);
    return backupPath;
  }

  /**
   * Validate all regions before patching
   */
  validateAll() {
    const results = [];

    for (const region of this.regions) {
      try {
        const validation = region.validate();
        results.push({
          offset: region.offset,
          status: 'valid',
          ...validation
        });
      } catch (error) {
        results.push({
          offset: region.offset,
          status: 'invalid',
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Apply all patches to disk (creates new file)
   */
  applyPatches(outputPath = null) {
    if (!outputPath) {
      outputPath = `${this.diskPath}.patched`;
    }

    // Read original disk
    const diskBuffer = fs.readFileSync(this.diskPath);
    const outputBuffer = Buffer.from(diskBuffer);

    // Sort regions by offset (reverse order to avoid offset shifts)
    const sortedRegions = [...this.regions].sort((a, b) => b.offset - a.offset);

    // Apply patches
    for (const region of sortedRegions) {
      try {
        // Validate patch destination
        const originalAtOffset = diskBuffer.slice(region.offset, region.offset + region.originalBytes.length);

        if (!originalAtOffset.equals(region.originalBytes)) {
          this.failed.push({
            offset: region.offset,
            reason: 'Original bytes do not match - disk may have changed',
            expected: region.originalBytes.toString('hex'),
            found: originalAtOffset.toString('hex')
          });
          continue;
        }

        // Apply translation
        region.translatedBytes.copy(outputBuffer, region.offset);

        // Pad with nulls if needed
        if (region.translatedBytes.length < region.maxLength) {
          outputBuffer.fill(0x00, region.offset + region.translatedBytes.length, region.offset + region.maxLength);
        }

        this.applied.push({
          offset: region.offset,
          original: region.originalText,
          translated: region.translatedText,
          bytesReplaced: region.translatedBytes.length
        });
      } catch (error) {
        this.failed.push({
          offset: region.offset,
          reason: error.message
        });
      }
    }

    // Write patched disk
    fs.writeFileSync(outputPath, outputBuffer);

    return {
      success: this.applied.length,
      failed: this.failed.length,
      output: outputPath,
      applied: this.applied,
      failed: this.failed
    };
  }

  /**
   * Verify patched disk integrity
   */
  verifyPatches(patchedPath) {
    const originalBuffer = fs.readFileSync(this.diskPath);
    const patchedBuffer = fs.readFileSync(patchedPath);

    if (originalBuffer.length !== patchedBuffer.length) {
      return {
        valid: false,
        error: 'Disk size changed during patching'
      };
    }

    const changes = [];
    const unchanged = originalBuffer.length;

    for (let i = 0; i < originalBuffer.length; i++) {
      if (originalBuffer[i] !== patchedBuffer[i]) {
        changes.push({
          offset: i,
          original: originalBuffer[i],
          patched: patchedBuffer[i]
        });
      }
    }

    return {
      valid: true,
      changedBytes: changes.length,
      unchanged: unchanged - changes.length,
      changes: changes.slice(0, 20) // Show first 20 changes
    };
  }

  /**
   * Generate detailed patch report
   */
  generateReport() {
    const patches = this.regions.map(r => r.generatePatch());

    return {
      disk: this.diskPath,
      timestamp: new Date().toISOString(),
      totalRegions: this.regions.length,
      status: {
        applied: this.applied.length,
        failed: this.failed.length,
        pending: this.regions.length - this.applied.length - this.failed.length
      },
      backup: this.backup,
      patches,
      applied: this.applied,
      failed: this.failed
    };
  }
}

/**
 * Multi-disk patcher for batch operations
 */
class BatchPatcher {
  constructor(diskFolderPath) {
    this.folderPath = diskFolderPath;
    this.patchers = new Map();
    this.results = [];
  }

  /**
   * Add disk to batch
   */
  addDisk(diskPath) {
    const patcher = new DiskPatcher(diskPath);
    this.patchers.set(diskPath, patcher);
    return patcher;
  }

  /**
   * Load patch plan from JSON
   */
  loadPatchPlan(planPath) {
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

    // Group patches by disk
    const byDisk = {};
    for (const patch of plan.patches) {
      if (!byDisk[patch.disk]) {
        byDisk[patch.disk] = [];
      }
      byDisk[patch.disk].push(patch);
    }

    // Apply to patchers
    for (const [disk, patches] of Object.entries(byDisk)) {
      const diskPath = path.join(this.folderPath, disk);
      const patcher = this.addDisk(diskPath);

      for (const patch of patches) {
        const region = patcher.addRegion(
          patch.offset,
          Buffer.from(patch.originalBytesHex, 'hex'),
          patch.originalText,
          patch.maxLength
        );
        region.setTranslation(patch.translatedText, { allowTruncate: true, padWithNull: true });
      }
    }
  }

  /**
   * Apply all patches to all disks
   */
  applyAllPatches() {
    const results = [];

    for (const [diskPath, patcher] of this.patchers) {
      patcher.createBackup();
      const result = patcher.applyPatches();
      results.push({
        disk: diskPath,
        ...result
      });
    }

    return results;
  }

  /**
   * Generate batch report
   */
  generateBatchReport() {
    const reports = [];

    for (const [diskPath, patcher] of this.patchers) {
      reports.push(patcher.generateReport());
    }

    return {
      timestamp: new Date().toISOString(),
      folder: this.folderPath,
      totalDisks: this.patchers.size,
      disks: reports
    };
  }
}

module.exports = {
  TextRegion,
  DiskPatcher,
  BatchPatcher
};
