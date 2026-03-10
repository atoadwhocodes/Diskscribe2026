const { getPatchProfile } = require('./lib/patch-profiles');
const { runProjectPatch } = require('./lib/patch-workflow');

function main() {
  const profileId = process.argv[2] || 'alshark';
  const profile = getPatchProfile(profileId);
  const report = runProjectPatch(profile);

  if (report.validation && !report.validation.valid) {
    process.exitCode = 1;
  }
}

main();
