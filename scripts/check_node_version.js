// Stops the npm test scripts early on Node.js older than 24. The test runner
// flag --test-isolation=none does not exist there, and Node.js would otherwise
// fail with "bad option" before running a single test.
const required = 24;
const major = Number(process.versions.node.split('.')[0]);
if (major < required) {
  console.error(`Frontier AI Valuation Lab needs Node.js ${required} to run its tests; this is Node.js ${process.version}.`);
  console.error('Run `nvm use` to switch to the version in .nvmrc, or install Node.js 24 from https://nodejs.org/.');
  process.exit(1);
}
