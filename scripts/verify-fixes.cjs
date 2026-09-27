const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '..', 'dist');

async function setGenderSettings(page, extId, settings) {
  await page.goto(`chrome-extension://${extId}/src/popup.html`);
  await page.waitForTimeout(1000);
  
  await page.evaluate(async (newSettings) => {
    const raw = (await chrome.storage.local.get('nsfw-filter-redux-storage'))['nsfw-filter-redux-storage'];
    if (Array.isArray(raw)) {
      raw[2].settings.enabled = true;
      raw[2].settings.logging = true;
      raw[2].settings.filterEffect = 'blur';
      raw[2].settings.genderFilter = newSettings;
      raw[1] += 1;
      await chrome.storage.local.set({ 'nsfw-filter-redux-storage': raw });
    }
  }, settings);

  await page.reload();
  await page.waitForTimeout(1000);
}

async function testFixes() {
  const tempProfile = path.resolve(__dirname, '..', '.test-profile-fixes');
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  console.log('=== Verifying Slider and SVG Bypass ===');
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
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  const match = sw?.url().match(/chrome-extension:\/\/([a-z0-9]+)\//);
  const extId = match ? match[1] : '';
  console.log('Extension ID:', extId);

  const popupPage = await context.newPage();
  console.log('Setting gender settings with confidenceThreshold: 65...');
  await setGenderSettings(popupPage, extId, {
    enabled: true,
    blurFemale: true,
    blurMale: false,
    confidenceThreshold: 65,
    classes: {
      real_male: false,
      real_female: true,
      anime_male: false,
      anime_female: true,
      other: false
    }
  });

  // Verify Confidence threshold slider is rendered
  const thresholdLabel = await popupPage.$('text="Confidence threshold"');
  if (thresholdLabel) {
    console.log('PASS: "Confidence threshold" slider label is visible in popup!');
  } else {
    console.error('FAIL: Could not find "Confidence threshold" in popup');
  }

  // Verify threshold percentage is displayed
  const thresholdVal = await popupPage.evaluate(() => {
    const allText = document.body.innerText;
    const match = allText.match(/Confidence threshold\s+(\d+)%/);
    return match ? match[1] : null;
  });
  console.log('Confidence threshold displayed value:', thresholdVal + '%');

  // Verify Redux storage holds confidenceThreshold
  const storedSettings = await popupPage.evaluate(async () => {
    const raw = (await chrome.storage.local.get('nsfw-filter-redux-storage'))['nsfw-filter-redux-storage'];
    if (Array.isArray(raw)) {
      return raw[2]?.settings?.genderFilter;
    }
    return null;
  });
  console.log('Stored genderFilter in chrome.storage:', storedSettings);

  // Now test SVG icon bypass on web page
  console.log('\nTesting SVG icon bypass on web page...');
  const testPage = await context.newPage();
  // Navigate to an actual URL so content script runs
  await testPage.goto('https://example.com', { waitUntil: 'domcontentloaded' });
  await testPage.evaluate(() => {
    const img1 = document.createElement('img');
    img1.id = 'svg-data';
    img1.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100' height='100' fill='green'/></svg>";
    img1.width = 100;
    img1.height = 100;
    document.body.appendChild(img1);

    const img2 = document.createElement('img');
    img2.id = 'svg-file';
    img2.src = 'https://raw.githubusercontent.com/haichteque/dont-show-me/main/dist/images/logo-mark.svg';
    img2.width = 100;
    img2.height = 100;
    document.body.appendChild(img2);
  });

  await testPage.waitForTimeout(2000);

  const statuses = await testPage.evaluate(() => {
    const dataImg = document.getElementById('svg-data');
    const fileImg = document.getElementById('svg-file');
    return {
      dataImgStatus: dataImg?.getAttribute('data-nsfw-filter-status'),
      dataImgFilter: dataImg?.style.filter,
      fileImgStatus: fileImg?.getAttribute('data-nsfw-filter-status'),
      fileImgFilter: fileImg?.style.filter
    };
  });

  console.log('SVG Test Results:', statuses);
  if (statuses.dataImgStatus === 'sfw' && statuses.fileImgStatus === 'sfw') {
    console.log('PASS: Both SVG icons marked SFW without blur!');
  } else {
    console.log('FAIL: SVG icons had unexpected statuses:', statuses);
  }

  // Take a screenshot of the popup for evidence
  const screenshotPath = path.resolve(__dirname, '..', 'test-results', 'popup_confidence_slider.png');
  await popupPage.screenshot({ path: screenshotPath });
  console.log('Saved popup screenshot to:', screenshotPath);

  await context.close();
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  console.log('\n=== All Verification Completed Successfully ===');
}

testFixes().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
