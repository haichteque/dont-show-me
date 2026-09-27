const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const EXT_PATH = path.resolve(__dirname, '..', 'dist');
const RESULTS_DIR = path.resolve(__dirname, '..', 'test-results');

if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

async function attachCDP(target) {
  try {
    const t = target.type();
    const url = target.url() || '';
    if (!['service_worker', 'other', 'page', 'background_page'].includes(t)) return;
    const cdp = await target.createCDPSession();
    await cdp.send('Runtime.enable').catch(() => {});
    const tag = `${t}:${url.split('/').pop().split('?')[0]}`;
    cdp.on('Runtime.consoleAPICalled', e => {
      const text = (e.args || []).map(a => a.value ?? a.description ?? a.type).join(' ');
      if (text.includes('Gender') || text.includes('TFJS') || text.includes('blur=') || text.includes('Model')) {
        console.log(`  [CDP:${tag}] ${text}`);
      }
    });
  } catch (_) {}
}

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

  await page.waitForTimeout(1000);
  console.log(`Updated gender settings to: enabled=${settings.enabled}, blurFemale=${settings.blurFemale}, blurMale=${settings.blurMale}`);
}

async function runE2E() {
  const tempProfile = path.resolve(__dirname, '..', '.test-profile-e2e');
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  console.log('=== Starting Gender Filter Playwright E2E Verification ===');
  console.log('Extension path:', EXT_PATH);

  const context = await chromium.launchPersistentContext(tempProfile, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // Track logs
  const logs = [];
  context.on('page', page => {
    page.on('console', msg => {
      const txt = msg.text();
      logs.push(`[${page.url().slice(0, 30)}] ${txt}`);
      if (txt.includes('Gender') || txt.includes('TFJS') || txt.includes('nsfw')) {
        console.log(`  [LOG] ${txt}`);
      }
    });
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  const match = sw?.url().match(/chrome-extension:\/\/([a-z0-9]+)\//);
  const extId = match ? match[1] : '';
  console.log('Detected Extension ID:', extId);

  const configPage = await context.newPage();

  // -------------------------------------------------------------
  // TEST 1: "anime girl" with blurFemale: true, blurMale: false
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: "anime girl" with blurFemale: true ---');
  await setGenderSettings(configPage, extId, {
    enabled: true,
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
  });

  const testPage = await context.newPage();
  console.log('Navigating to Bing Image Search for "anime girl"...');
  await testPage.goto('https://www.bing.com/images/search?q=anime+girl', { waitUntil: 'domcontentloaded' });
  
  // Wait for images to appear and extension to process
  console.log('Waiting for image classification on Bing Images...');
  let blurredCount = 0;
  let sfwCount = 0;
  let totalImages = 0;

  for (let i = 0; i < 20; i++) {
    await testPage.waitForTimeout(1000);
    const stats = await testPage.evaluate(() => {
      const all = Array.from(document.querySelectorAll('img'));
      const blurred = document.querySelectorAll('img[data-nsfw-filter-status="nsfw"]');
      const sfw = document.querySelectorAll('img[data-nsfw-filter-status="sfw"]');
      const processing = document.querySelectorAll('img[data-nsfw-filter-status="processing"]');
      return {
        total: all.length,
        blurred: blurred.length,
        sfw: sfw.length,
        processing: processing.length,
        blurredFilters: Array.from(blurred).slice(0, 3).map(img => img.style.filter)
      };
    });

    blurredCount = stats.blurred;
    sfwCount = stats.sfw;
    totalImages = stats.total;

    if (stats.blurred > 0 || stats.sfw > 5) {
      console.log(`[Second ${i + 1}] Images total: ${stats.total}, Blurred (NSFW/Gender): ${stats.blurred}, SFW: ${stats.sfw}, Processing: ${stats.processing}`);
      if (stats.blurred > 0) {
        console.log(`  Sample blurred style.filter:`, stats.blurredFilters);
        break;
      }
    }
  }

  // Scroll down a bit to trigger more images if needed
  if (blurredCount === 0) {
    console.log('Scrolling down to trigger more image loads...');
    await testPage.evaluate(() => window.scrollBy(0, 500));
    await testPage.waitForTimeout(3000);
    const stats = await testPage.evaluate(() => {
      const blurred = document.querySelectorAll('img[data-nsfw-filter-status="nsfw"]');
      const sfw = document.querySelectorAll('img[data-nsfw-filter-status="sfw"]');
      return { blurred: blurred.length, sfw: sfw.length };
    });
    blurredCount = stats.blurred;
    sfwCount = stats.sfw;
  }

  const screenshotPath1 = path.join(RESULTS_DIR, 'anime_girl_blurred.png');
  await testPage.screenshot({ path: screenshotPath1 });
  console.log(`Saved screenshot 1 to: ${screenshotPath1}`);
  console.log(`TEST 1 Result: blurred=${blurredCount}, sfw=${sfwCount}, total=${totalImages}`);

  // -------------------------------------------------------------
  // TEST 2: "ichigo" with blurFemale: false, blurMale: true
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: "ichigo" with blurMale: true ---');
  await setGenderSettings(configPage, extId, {
    enabled: true,
    blurFemale: false,
    blurMale: true,
    confidenceThreshold: 50,
    classes: {
      real_male: true,
      real_female: false,
      anime_male: true,
      anime_female: false,
      other: false
    }
  });

  console.log('Navigating to Bing Image Search for "ichigo"...');
  await testPage.goto('https://www.bing.com/images/search?q=ichigo', { waitUntil: 'domcontentloaded' });
  
  console.log('Waiting for image classification on Bing Images...');
  let blurredCount2 = 0;
  let sfwCount2 = 0;
  let totalImages2 = 0;

  for (let i = 0; i < 20; i++) {
    await testPage.waitForTimeout(1000);
    const stats = await testPage.evaluate(() => {
      const all = Array.from(document.querySelectorAll('img'));
      const blurred = document.querySelectorAll('img[data-nsfw-filter-status="nsfw"]');
      const sfw = document.querySelectorAll('img[data-nsfw-filter-status="sfw"]');
      const processing = document.querySelectorAll('img[data-nsfw-filter-status="processing"]');
      return {
        total: all.length,
        blurred: blurred.length,
        sfw: sfw.length,
        processing: processing.length,
        blurredFilters: Array.from(blurred).slice(0, 3).map(img => img.style.filter)
      };
    });

    blurredCount2 = stats.blurred;
    sfwCount2 = stats.sfw;
    totalImages2 = stats.total;

    if (stats.blurred > 0 || stats.sfw > 5) {
      console.log(`[Second ${i + 1}] Images total: ${stats.total}, Blurred (NSFW/Gender): ${stats.blurred}, SFW: ${stats.sfw}, Processing: ${stats.processing}`);
      if (stats.blurred > 0) {
        console.log(`  Sample blurred style.filter:`, stats.blurredFilters);
        break;
      }
    }
  }

  if (blurredCount2 === 0) {
    console.log('Scrolling down to trigger more image loads...');
    await testPage.evaluate(() => window.scrollBy(0, 500));
    await testPage.waitForTimeout(3000);
    const stats = await testPage.evaluate(() => {
      const blurred = document.querySelectorAll('img[data-nsfw-filter-status="nsfw"]');
      const sfw = document.querySelectorAll('img[data-nsfw-filter-status="sfw"]');
      return { blurred: blurred.length, sfw: sfw.length };
    });
    blurredCount2 = stats.blurred;
    sfwCount2 = stats.sfw;
  }

  const screenshotPath2 = path.join(RESULTS_DIR, 'ichigo_blurred.png');
  await testPage.screenshot({ path: screenshotPath2 });
  console.log(`Saved screenshot 2 to: ${screenshotPath2}`);
  console.log(`TEST 2 Result: blurred=${blurredCount2}, sfw=${sfwCount2}, total=${totalImages2}`);

  // -------------------------------------------------------------
  // TEST 3: Inverted Control - "anime girl" with blurMale: true, blurFemale: false
  // Verify anime girl is NOT blurred when only blurMale is active
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Inverted Control: "anime girl" with blurMale: true (blurFemale: false) ---');
  await testPage.goto('https://www.bing.com/images/search?q=anime+girl', { waitUntil: 'domcontentloaded' });
  await testPage.waitForTimeout(4000);
  const stats3 = await testPage.evaluate(() => {
    const blurred = document.querySelectorAll('img[data-nsfw-filter-status="nsfw"]');
    const sfw = document.querySelectorAll('img[data-nsfw-filter-status="sfw"]');
    return { blurred: blurred.length, sfw: sfw.length };
  });
  console.log(`TEST 3 Inverted Result: blurred=${stats3.blurred} (expected 0 or only truly NSFW), sfw=${stats3.sfw}`);

  await context.close();
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  console.log('\n=== All Tests Completed ===');
  console.log(`Test 1 Anime Girl blurred: ${blurredCount}`);
  console.log(`Test 2 Ichigo blurred: ${blurredCount2}`);
  console.log(`Test 3 Anime Girl with blurMale only: blurred=${stats3.blurred}, sfw=${stats3.sfw}`);

  return {
    test1: { blurred: blurredCount, sfw: sfwCount },
    test2: { blurred: blurredCount2, sfw: sfwCount2 },
    test3: { blurred: stats3.blurred, sfw: stats3.sfw }
  };
}

runE2E().catch(err => {
  console.error('Fatal E2E error:', err);
  process.exit(1);
});
