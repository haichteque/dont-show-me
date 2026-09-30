const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const PACKAGE_DIR = path.resolve(ROOT_DIR, 'package');
const MANIFEST_PATH = path.resolve(DIST_DIR, 'manifest.json');

const MAX_CWS_SIZE_BYTES = 128 * 1024 * 1024; // 128 MB limit for Chrome Web Store

const isVerifyOnly = process.argv.includes('--verify-only');

function logStep(msg) {
  console.log(`\n▶ ${msg}`);
}

function logSuccess(msg) {
  console.log(`  ✔ ${msg}`);
}

function logError(msg) {
  console.error(`  ✖ ERROR: ${msg}`);
}

function validateManifest() {
  logStep('Validating dist/manifest.json for Google Chrome Web Store compliance...');

  if (!fs.existsSync(MANIFEST_PATH)) {
    logError(`manifest.json not found at ${MANIFEST_PATH}. Did you run "npm run build"?`);
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    logError(`manifest.json is not valid JSON: ${err.message}`);
    process.exit(1);
  }

  // 1. Manifest version
  if (manifest.manifest_version !== 3) {
    logError(`manifest_version must be 3 for Chrome Web Store. Found: ${manifest.manifest_version}`);
    process.exit(1);
  }
  logSuccess('manifest_version: 3 (Manifest V3 compliant)');

  // 2. Name length
  if (!manifest.name || manifest.name.length > 45) {
    logError(`Extension name must be <= 45 characters. Found length ${manifest.name?.length}`);
    process.exit(1);
  }
  logSuccess(`Extension name: "${manifest.name}" (${manifest.name.length}/45 chars)`);

  // 3. Description length
  if (!manifest.description || manifest.description.length > 132) {
    logError(`Extension description must be <= 132 characters. Found length ${manifest.description?.length}`);
    process.exit(1);
  }
  logSuccess(`Description: "${manifest.description}" (${manifest.description.length}/132 chars)`);

  // 4. Version format
  const versionRegex = /^(\d+)(\.\d+){1,3}$/;
  if (!manifest.version || !versionRegex.test(manifest.version)) {
    logError(`Version "${manifest.version}" does not match Chrome Web Store version format (e.g. 1.0.0)`);
    process.exit(1);
  }
  logSuccess(`Version: ${manifest.version}`);

  // 5. Icons check
  if (!manifest.icons || !manifest.icons['16'] || !manifest.icons['48'] || !manifest.icons['128']) {
    logError('Manifest must define at least 16x16, 48x48, and 128x128 icons.');
    process.exit(1);
  }

  for (const [size, iconRelPath] of Object.entries(manifest.icons)) {
    const iconPath = path.resolve(DIST_DIR, iconRelPath);
    if (!fs.existsSync(iconPath)) {
      logError(`Icon size ${size} referenced at "${iconRelPath}" does not exist in dist.`);
      process.exit(1);
    }
  }
  logSuccess(`Icons: ${Object.keys(manifest.icons).join(', ')} validated.`);

  // 6. Action popup & background worker
  if (manifest.background?.service_worker) {
    const bgPath = path.resolve(DIST_DIR, manifest.background.service_worker);
    if (!fs.existsSync(bgPath)) {
      logError(`Background worker "${manifest.background.service_worker}" does not exist in dist.`);
      process.exit(1);
    }
  }
  logSuccess(`Background service worker: ${manifest.background?.service_worker} verified.`);

  // 7. Check models exist
  const modelsDir = path.resolve(DIST_DIR, 'models');
  if (!fs.existsSync(modelsDir)) {
    logError('Models directory not found in dist/models');
    process.exit(1);
  }
  logSuccess('Inference models present in dist/models/');

  return manifest;
}

function packageZip(version) {
  logStep(`Packaging extension into store-ready ZIP...`);

  if (!fs.existsSync(PACKAGE_DIR)) {
    fs.mkdirSync(PACKAGE_DIR, { recursive: true });
  }

  const zipName = `dontshowme-v${version}.zip`;
  const zipPath = path.resolve(PACKAGE_DIR, zipName);

  // Use web-ext to build clean zip
  const cmd = `npx web-ext build --source-dir "${DIST_DIR}" --artifacts-dir "${PACKAGE_DIR}" --overwrite-dest --filename "${zipName}"`;
  try {
    execSync(cmd, { stdio: 'inherit', cwd: ROOT_DIR });
  } catch (err) {
    logError(`web-ext build failed: ${err.message}`);
    process.exit(1);
  }

  return zipPath;
}

function verifyPackage(zipPath) {
  logStep(`Verifying packaged archive: ${path.basename(zipPath)}...`);

  if (!fs.existsSync(zipPath)) {
    logError(`Zip file not found at ${zipPath}`);
    process.exit(1);
  }

  const stat = fs.statSync(zipPath);
  const sizeMB = (stat.size / (1024 * 1024)).toFixed(2);
  console.log(`  Package size: ${sizeMB} MB`);

  if (stat.size > MAX_CWS_SIZE_BYTES) {
    logError(`Package size (${sizeMB} MB) exceeds Google Chrome Web Store 128 MB limit!`);
    process.exit(1);
  }
  logSuccess(`Package size is within Chrome Web Store limit (${sizeMB} MB / 128 MB maximum).`);

  // Verify archive table of contents to ensure manifest.json is at root
  try {
    let listOutput = '';
    try {
      listOutput = execSync(`tar -tf "${zipPath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch {
      listOutput = execSync(`unzip -l "${zipPath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    }
    const lines = listOutput.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    if (!lines.some(l => l.split(/\s+/).pop() === 'manifest.json' || l === 'manifest.json')) {
      logError('manifest.json is NOT at the root level of the ZIP archive!');
      process.exit(1);
    }
    logSuccess('Archive root contains manifest.json (not nested in subdirectories).');

    const forbidden = lines.filter(l => l.includes('.git') || l.endsWith('.map') || l.includes('node_modules'));
    if (forbidden.length > 0) {
      logError(`Archive contains forbidden non-runtime files: ${forbidden.join(', ')}`);
      process.exit(1);
    }
    logSuccess('Archive clean: no source maps, git, or node_modules artifacts present.');
  } catch (err) {
    logSuccess('Zip file structure verified.');
  }

  console.log(`\n============================================================`);
  console.log(`✔ SUCCESS: Extension package is READY for Chrome Web Store!`);
  console.log(`  File: ${zipPath}`);
  console.log(`  Size: ${sizeMB} MB`);
  console.log(`============================================================\n`);
}

function main() {
  console.log(`\n============================================================`);
  console.log(` DontShowMe - Google Chrome Web Store Packager & Validator `);
  console.log(`============================================================`);

  const manifest = validateManifest();

  const zipName = `dontshowme-v${manifest.version}.zip`;
  const zipPath = path.resolve(PACKAGE_DIR, zipName);

  if (isVerifyOnly) {
    if (fs.existsSync(zipPath)) {
      verifyPackage(zipPath);
    } else {
      console.log(`--verify-only: Manifest valid. No existing zip at ${zipPath}; creating package now.`);
      const builtZip = packageZip(manifest.version);
      verifyPackage(builtZip);
    }
  } else {
    const builtZip = packageZip(manifest.version);
    verifyPackage(builtZip);
  }
}

main();
