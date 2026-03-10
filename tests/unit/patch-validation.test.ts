const fs = require('fs');
const os = require('os');
const path = require('path');
const { validatePatchSet } = require('../../scripts/lib/patch-validation.js');

describe('validatePatchSet', () => {
  it('detects protected range and passthrough integrity failures', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-validation-'));
    const sourceDir = path.join(tempRoot, 'source');
    const outputDir = path.join(tempRoot, 'output');

    fs.mkdirSync(sourceDir);
    fs.mkdirSync(outputDir);

    try {
      const systemSource = Buffer.alloc(0x3000, 0x41);
      const systemPatched = Buffer.from(systemSource);
      systemPatched[0x0100] = 0x42;

      const dataSource = Buffer.alloc(0x3000, 0x55);
      const dataPatched = Buffer.from(dataSource);
      dataPatched[0x2500] = 0x56;

      fs.writeFileSync(path.join(sourceDir, 'system.hdm'), systemSource);
      fs.writeFileSync(path.join(outputDir, 'system.hdm'), systemPatched);
      fs.writeFileSync(path.join(sourceDir, 'data.hdm'), dataSource);
      fs.writeFileSync(path.join(outputDir, 'data.hdm'), dataPatched);

      const report = validatePatchSet({
        sourceDir,
        outputDir,
        requiredFiles: ['system.hdm', 'data.hdm'],
        identicalFiles: ['data.hdm'],
        protectedRangesByFile: {
          'system.hdm': [{ label: 'boot', start: 0x0000, end: 0x0200 }],
          'data.hdm': [{ label: 'fat', start: 0x0200, end: 0x2400 }]
        }
      });

      const systemReport = report.files.find((file: any) => file.fileName === 'system.hdm');
      const dataReport = report.files.find((file: any) => file.fileName === 'data.hdm');

      expect(report.valid).toBe(false);
      expect(report.summary.protectedRangeFailures).toBe(1);
      expect(report.summary.identicalFailures).toBe(1);
      expect(systemReport.protectedRanges[0].passed).toBe(false);
      expect(dataReport.identical.passed).toBe(false);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
