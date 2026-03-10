const { getPatchProfile } = require('./lib/patch-profiles');
const { runProjectValidation } = require('./lib/patch-workflow');

function main() {
  const profileId = process.argv[2] || 'alshark';
  const profile = getPatchProfile(profileId);
  const result = runProjectValidation(profile);

  if (!result.report.valid) {
    process.exitCode = 1;
  }
}

main();
