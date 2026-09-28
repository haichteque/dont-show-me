const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const EXT_PATH = path.resolve(__dirname, '..', 'dist');
const IMAGES_DIR = path.resolve(__dirname, '..', 'test-eval-images');

const server = http.createServer((req, res) => {
  const filePath = path.join(IMAGES_DIR, decodeURIComponent(req.url.replace(/^\//, '')));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', filePath.endsWith('.png') ? 'image/png' : 'image/jpeg');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

async function main() {
  await new Promise(resolve => server.listen(8765, resolve));
  console.log('HTTP Server listening on http://127.0.0.1:8765');

  const tempProfile = path.resolve(__dirname, '..', '.test-profile-eval');
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  const context = await chromium.launchPersistentContext(tempProfile, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox'
    ]
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  const match = sw?.url().match(/chrome-extension:\/\/([a-z0-9]+)\//);
  const extId = match ? match[1] : '';
  console.log('Extension ID:', extId);

  // Open popup to initialize extension
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extId}/src/popup.html`);
  await popupPage.waitForTimeout(1000);

  // Send an initial classify to ensure offscreen doc is up
  await popupPage.evaluate(async () => {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ type: 'ANALYZE_IMAGE', url: 'http://127.0.0.1:8765/default_avatar.png' }, resolve);
    });
  });
  await popupPage.waitForTimeout(2000);

  // Helper to send settings directly to offscreen
  async function configureOffscreen(trainedModel, filterStrictness, genderFilterEnabled = false) {
    await popupPage.evaluate(async ({ trainedModel, filterStrictness, genderFilterEnabled }) => {
      return new Promise(resolve => {
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'SET_SETTINGS',
          trainedModel,
          filterStrictness,
          logging: true,
          genderFilter: {
            enabled: genderFilterEnabled,
            blurFemale: true,
            blurMale: false,
            confidenceThreshold: 50,
            classes: {
              real_male: false,
              real_female: true,
              anime_male: false,
              anime_female: true,
              other: false
            }
          }
        }, resolve);
      });
    }, { trainedModel, filterStrictness, genderFilterEnabled });
    await popupPage.waitForTimeout(2000);
  }

  // Helper to classify via offscreen target
  async function classifyDirect(url) {
    return await popupPage.evaluate(async (imgUrl) => {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ target: 'offscreen', type: 'CLASSIFY', url: imgUrl, label: imgUrl }, (res) => {
          resolve(res);
        });
      });
    }, url);
  }

  const imageFiles = fs.readdirSync(IMAGES_DIR);

  console.log('\n============================================================');
  console.log('TEST 1: DEFAULT MODEL = ViT_NSFW_384 (Strictness: 55, Gender filter: OFF)');
  console.log('============================================================');
  await configureOffscreen('ViT_NSFW_384', 55, false);

  for (const file of imageFiles) {
    const url = `http://127.0.0.1:8765/${file}`;
    const res = await classifyDirect(url);
    console.log(`[ViT] ${file.padEnd(25)} => blocked: ${String(res?.result).padEnd(5)} reason: ${res?.reason || 'safe'}`);
  }

  console.log('\n============================================================');
  console.log('TEST 2: LEGACY MODEL = MobileNet_v1.2 (Strictness: 55, Gender filter: OFF)');
  console.log('============================================================');
  await configureOffscreen('MobileNet_v1.2', 55, false);

  for (const file of imageFiles) {
    const url = `http://127.0.0.1:8765/${file}`;
    const res = await classifyDirect(url);
    console.log(`[MobileNet] ${file.padEnd(25)} => blocked: ${String(res?.result).padEnd(5)} reason: ${res?.reason || 'safe'}`);
  }

  console.log('\n============================================================');
  console.log('TEST 3: ViT_NSFW_384 with Gender filter ON (Strictness: 55)');
  console.log('============================================================');
  await configureOffscreen('ViT_NSFW_384', 55, true);

  for (const file of imageFiles) {
    const url = `http://127.0.0.1:8765/${file}`;
    const res = await classifyDirect(url);
    const detail = res?.gender ? `[${res.gender} ${(res.confidence * 100).toFixed(1)}%]` : '';
    console.log(`[ViT+Gender] ${file.padEnd(25)} => blocked: ${String(res?.result).padEnd(5)} reason: ${res?.reason || 'safe'} ${detail}`);
  }

  console.log('\n============================================================');
  console.log('TEST 4: MobileNet_v1.2 with Gender filter ON (Strictness: 55)');
  console.log('============================================================');
  await configureOffscreen('MobileNet_v1.2', 55, true);

  for (const file of imageFiles) {
    const url = `http://127.0.0.1:8765/${file}`;
    const res = await classifyDirect(url);
    const detail = res?.gender ? `[${res.gender} ${(res.confidence * 100).toFixed(1)}%]` : '';
    console.log(`[MobileNet+Gender] ${file.padEnd(25)} => blocked: ${String(res?.result).padEnd(5)} reason: ${res?.reason || 'safe'} ${detail}`);
  }

  await context.close();
  server.close();
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }
}

main().catch(err => {
  console.error('Test run failed:', err);
  server.close();
  process.exit(1);
});
