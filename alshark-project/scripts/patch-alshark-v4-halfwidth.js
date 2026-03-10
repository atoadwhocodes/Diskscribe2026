const { runProjectPatch } = require('../../scripts/lib/patch-workflow');
const profile = require('../../scripts/lib/patch-profiles/alshark');

function main() {
  const report = runProjectPatch(profile);
  if (report.validation && !report.validation.valid) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = profile;
