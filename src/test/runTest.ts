async function main(): Promise<void> {
  // Placeholder test entrypoint so `npm test` succeeds until integration tests are added.
  console.log('No automated tests are configured yet.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
