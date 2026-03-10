const profiles = {
  alshark: require('./alshark')
};

function getPatchProfile(profileId) {
  const normalized = String(profileId || '').trim().toLowerCase();
  const profile = profiles[normalized];
  if (!profile) {
    throw new Error(`Unknown patch profile "${profileId}". Available profiles: ${listPatchProfiles().join(', ')}`);
  }
  return profile;
}

function listPatchProfiles() {
  return Object.keys(profiles).sort();
}

module.exports = {
  getPatchProfile,
  listPatchProfiles
};
