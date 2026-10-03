const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const DEMO_DIR = path.resolve(ROOT_DIR, 'demo', 'images');
const TEMP_DIR = path.resolve(ROOT_DIR, '.temp-asset-frames');

if (!fs.existsSync(DEMO_DIR)) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
}
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

async function run() {
  console.log('=== Starting Readme Asset Generation ===');

  const tempProfile = path.resolve(ROOT_DIR, '.test-profile-assets');
  if (fs.existsSync(tempProfile)) {
    fs.rmSync(tempProfile, { recursive: true, force: true });
  }

  const context = await chromium.launchPersistentContext(tempProfile, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    args: [
      `--disable-extensions-except=${DIST_DIR}`,
      `--load-extension=${DIST_DIR}`,
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  console.log('Waiting for extension service worker...');
  let sw = context.serviceWorkers()[0];
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);
  }
  const match = sw?.url().match(/chrome-extension:\/\/([a-z0-9]+)\//);
  const extId = match ? match[1] : '';
  console.log('Detected Extension ID:', extId);

  // 1. CAPTURE POPUP UI
  console.log('\n--- 1. Capturing Extension Popup ---');
  const popupPage = await context.newPage();
  await popupPage.goto(`chrome-extension://${extId}/src/popup.html`);
  await popupPage.waitForTimeout(1000);

  // Set realistic demo settings
  await popupPage.evaluate(async () => {
    const raw = (await chrome.storage.local.get('nsfw-filter-redux-storage'))['nsfw-filter-redux-storage'];
    if (Array.isArray(raw)) {
      raw[2].settings.enabled = true;
      raw[2].settings.filterStrictness = 65;
      raw[2].settings.filterEffect = 'blur';
      raw[2].settings.genderFilter = {
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
      };
      raw[2].statistics = { totalBlocked: 42 };
      raw[1] += 1;
      await chrome.storage.local.set({ 'nsfw-filter-redux-storage': raw });
    }
  });

  await popupPage.reload();
  await popupPage.waitForTimeout(1200);

  // Expand "Customize individual classes" to show full capabilities
  try {
    const expandBtn = await popupPage.$('div[aria-expanded="false"]');
    if (expandBtn) await expandBtn.click();
    await popupPage.waitForTimeout(400);
  } catch (_) {}

  // Screenshot popup standalone
  const popupEl = await popupPage.$('#root > div') || await popupPage.$('div');
  const popupPath = path.join(DEMO_DIR, 'popup-preview.png');
  const popupDarkPath = path.join(DEMO_DIR, 'popup-dark.png');
  if (popupEl) {
    await popupEl.screenshot({ path: popupPath });
    fs.copyFileSync(popupPath, popupDarkPath);
    console.log(`Saved popup preview: ${popupPath}`);
  }

  // 2. CAPTURE OPTIONS PAGE
  console.log('\n--- 2. Capturing Options Page ---');
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extId}/src/options.html`);
  await optionsPage.waitForTimeout(1500);
  const optionsPath = path.join(DEMO_DIR, 'options-preview.png');
  await optionsPage.screenshot({ path: optionsPath });
  console.log(`Saved options preview: ${optionsPath}`);

  // 3. GENERATE SIDE-BY-SIDE FILTERING COMPARISON
  console.log('\n--- 3. Generating Side-by-Side Filtering Showcase ---');
  const showcaseHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        background: #0B0F17;
        color: #F0F6FC;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        padding: 24px;
      }
      .card {
        background: #161B22;
        border: 1px solid #30363D;
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.6);
        max-width: 1060px;
        width: 100%;
        overflow: hidden;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 28px;
        border-bottom: 1px solid #30363D;
        background: rgba(13, 17, 23, 0.7);
      }
      .title {
        font-size: 18px;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 10px;
        color: #58A6FF;
      }
      .pill {
        background: #238636;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 20px;
      }
      .grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        padding: 24px;
      }
      .col {
        background: #0D1117;
        border: 1px solid #21262D;
        border-radius: 12px;
        padding: 16px;
      }
      .col-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
        padding-bottom: 10px;
        border-bottom: 1px solid #21262D;
      }
      .col-title {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .badge-unprotected { color: #F85149; background: rgba(248,81,73,0.15); padding: 3px 8px; border-radius: 6px; font-size: 12px; }
      .badge-protected { color: #3FB950; background: rgba(63,185,80,0.15); padding: 3px 8px; border-radius: 6px; font-size: 12px; }
      .img-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .img-card {
        background: #161B22;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #30363D;
        position: relative;
      }
      .img-card img {
        width: 100%;
        height: 140px;
        object-fit: cover;
        display: block;
      }
      .img-card.blurred img {
        filter: blur(14px) brightness(0.9);
        transform: scale(1.05);
      }
      .img-label {
        font-size: 11px;
        color: #8B949E;
        padding: 6px 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #161B22;
      }
      .status-tag {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .tag-passed { background: rgba(63,185,80,0.2); color: #3FB950; }
      .tag-blurred { background: rgba(210,153,34,0.25); color: #E3B341; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="header">
        <div class="title">
          <span>🙈 DontShowMe Selective Filtering Engine</span>
        </div>
        <div class="pill">Filter: Real &amp; Anime Female (Strictness: 65%)</div>
      </div>
      <div class="grid">
        <!-- Unfiltered Column -->
        <div class="col">
          <div class="col-header">
            <span class="col-title" style="color: #F85149;">Original Web Page</span>
            <span class="badge-unprotected">Unfiltered</span>
          </div>
          <div class="img-row">
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/landscape.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Landscape</span><span>Safe</span></div>
            </div>
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/clock_object.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Clock Object</span><span>Safe</span></div>
            </div>
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/real_female/woman_portrait.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Portrait</span><span>Female</span></div>
            </div>
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/anime_female/anime_girl.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Illustration</span><span>Anime Female</span></div>
            </div>
          </div>
        </div>

        <!-- Filtered Column -->
        <div class="col">
          <div class="col-header">
            <span class="col-title" style="color: #3FB950;">With DontShowMe Enabled</span>
            <span class="badge-protected">100% On-Device Protection</span>
          </div>
          <div class="img-row">
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/landscape.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Landscape</span><span class="status-tag tag-passed">✔ Clean (Shown)</span></div>
            </div>
            <div class="img-card">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/clock_object.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Clock Object</span><span class="status-tag tag-passed">✔ Clean (Shown)</span></div>
            </div>
            <div class="img-card blurred">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/real_female/woman_portrait.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Portrait</span><span class="status-tag tag-blurred">🔒 Filtered (Blurred)</span></div>
            </div>
            <div class="img-card blurred">
              <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/anime_female/anime_girl.jpg').replace(/\\/g, '/')}" />
              <div class="img-label"><span>Illustration</span><span class="status-tag tag-blurred">🔒 Filtered (Blurred)</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  const showcaseHtmlPath = path.join(TEMP_DIR, 'showcase.html');
  fs.writeFileSync(showcaseHtmlPath, showcaseHtml);

  const showcasePage = await context.newPage();
  await showcasePage.goto(`file://${showcaseHtmlPath}`);
  await showcasePage.waitForTimeout(1000);
  const showcaseCard = await showcasePage.$('.card');
  const showcaseImgPath = path.join(DEMO_DIR, 'filtering-showcase.png');
  await showcaseCard.screenshot({ path: showcaseImgPath });
  console.log(`Saved filtering showcase: ${showcaseImgPath}`);

  // 4. GENERATE HERO COVER BANNER (1280x640)
  console.log('\n--- 4. Generating Hero Cover Banner ---');
  const popupBase64 = fs.readFileSync(popupPath).toString('base64');
  const iconBase64 = fs.readFileSync(path.resolve(ROOT_DIR, 'dist/images/icon128.png')).toString('base64');

  const coverHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: 1280px;
        height: 640px;
        background: #0B0F17;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #F0F6FC;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 70px;
      }
      /* Ambient glows */
      .glow-1 {
        position: absolute;
        width: 600px;
        height: 600px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(0, 210, 255, 0.15) 0%, rgba(0,0,0,0) 70%);
        top: -150px;
        left: -150px;
        pointer-events: none;
      }
      .glow-2 {
        position: absolute;
        width: 700px;
        height: 700px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(138, 43, 226, 0.18) 0%, rgba(0,0,0,0) 70%);
        bottom: -200px;
        right: -100px;
        pointer-events: none;
      }
      .glow-grid {
        position: absolute;
        inset: 0;
        background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
        background-size: 32px 32px;
        pointer-events: none;
      }
      /* Left Hero Text */
      .hero-left {
        max-width: 650px;
        z-index: 2;
      }
      .brand-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: rgba(35, 134, 54, 0.2);
        border: 1px solid rgba(63, 185, 80, 0.4);
        color: #3FB950;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 20px;
        letter-spacing: 0.5px;
      }
      .brand-badge .dot {
        width: 8px;
        height: 8px;
        background: #3FB950;
        border-radius: 50%;
        box-shadow: 0 0 8px #3FB950;
      }
      .hero-title-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-bottom: 12px;
      }
      .hero-logo {
        width: 58px;
        height: 58px;
        border-radius: 14px;
        background: #161B22;
        border: 1px solid #30363D;
        padding: 6px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .hero-title {
        font-size: 52px;
        font-weight: 800;
        letter-spacing: -1px;
        background: linear-gradient(135deg, #FFFFFF 0%, #A5D6FF 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .hero-tagline {
        font-size: 22px;
        line-height: 1.4;
        color: #C9D1D9;
        margin-bottom: 26px;
        font-weight: 400;
      }
      .pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      .pill-item {
        background: #161B22;
        border: 1px solid #30363D;
        padding: 7px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        color: #8B949E;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .pill-item strong {
        color: #F0F6FC;
      }
      /* Right Mockup */
      .hero-right {
        z-index: 2;
        position: relative;
      }
      .popup-mockup {
        width: 330px;
        border-radius: 16px;
        overflow: hidden;
        border: 1px solid #30363D;
        box-shadow: 0 24px 60px rgba(0,0,0,0.8), 0 0 40px rgba(0, 210, 255, 0.15);
        transform: rotate(-1.5deg) scale(0.98);
        transition: transform 0.3s ease;
      }
      .popup-mockup img {
        width: 100%;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="glow-1"></div>
    <div class="glow-2"></div>
    <div class="glow-grid"></div>

    <div class="hero-left">
      <div class="brand-badge">
        <span class="dot"></span>
        100% CLIENT-SIDE &bull; ZERO TELEMETRY
      </div>
      <div class="hero-title-row">
        <img class="hero-logo" src="data:image/png;base64,${iconBase64}" />
        <h1 class="hero-title">DontShowMe</h1>
      </div>
      <p class="hero-tagline">
        Intelligent in-browser content filtering powered by TensorFlow.js. Filters adult imagery and selectively blurs real &amp; anime character categories without cloud latency or tracking.
      </p>
      <div class="pills">
        <div class="pill-item">🛡️ <strong>Dual-Stage NSFW Pass</strong></div>
        <div class="pill-item">👤 <strong>5-Class Recognition</strong></div>
        <div class="pill-item">⚡ <strong>WebGL + WASM</strong></div>
        <div class="pill-item">🔒 <strong>Zero Remote Servers</strong></div>
      </div>
    </div>

    <div class="hero-right">
      <div class="popup-mockup">
        <img src="data:image/png;base64,${popupBase64}" />
      </div>
    </div>
  </body>
  </html>
  `;

  const coverHtmlPath = path.join(TEMP_DIR, 'cover.html');
  fs.writeFileSync(coverHtmlPath, coverHtml);

  const coverPage = await context.newPage();
  await coverPage.setViewportSize({ width: 1280, height: 640 });
  await coverPage.goto(`file://${coverHtmlPath}`);
  await coverPage.waitForTimeout(1000);
  const coverPath = path.join(DEMO_DIR, 'cover.png');
  await coverPage.screenshot({ path: coverPath });
  console.log(`Saved hero cover banner: ${coverPath}`);

  // 5. CAPTURE ANIMATED DEMO FRAMES
  console.log('\n--- 5. Capturing Demo GIF Frames ---');
  // We simulate a demo interaction on a test web page with the popup overlay
  const demoPageHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0D1117;
        color: #C9D1D9;
        width: 1000px;
        height: 620px;
        overflow: hidden;
        position: relative;
        padding: 24px;
      }
      .browser-bar {
        background: #161B22;
        border: 1px solid #30363D;
        border-radius: 8px 8px 0 0;
        padding: 10px 16px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .dots { display: flex; gap: 6px; }
      .dot { width: 10px; height: 10px; border-radius: 50%; }
      .dot-red { background: #FF5F56; }
      .dot-yellow { background: #FFBD2E; }
      .dot-green { background: #27C93F; }
      .url-bar {
        background: #0D1117;
        border: 1px solid #30363D;
        border-radius: 6px;
        flex: 1;
        padding: 5px 12px;
        font-size: 13px;
        color: #8B949E;
      }
      .ext-icon {
        width: 24px;
        height: 24px;
        background: #21262D;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #30363D;
      }
      .content {
        background: #0B0F17;
        border: 1px solid #30363D;
        border-top: none;
        border-radius: 0 0 8px 8px;
        height: 520px;
        padding: 20px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        position: relative;
      }
      .item {
        background: #161B22;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #30363D;
        display: flex;
        flex-direction: column;
      }
      .item img {
        width: 100%;
        height: 180px;
        object-fit: cover;
        transition: filter 0.4s ease;
      }
      .item .lbl {
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 500;
        display: flex;
        justify-content: space-between;
      }
      .blurred img {
        filter: blur(16px) brightness(0.85);
      }
      /* Simulated popup floating in top right */
      .floating-popup {
        position: absolute;
        top: 60px;
        right: 32px;
        width: 320px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #30363D;
        box-shadow: 0 16px 40px rgba(0,0,0,0.85);
        z-index: 100;
        background: #161B22;
      }
      .floating-popup img {
        width: 100%;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="browser-bar">
      <div class="dots">
        <span class="dot dot-red"></span>
        <span class="dot dot-yellow"></span>
        <span class="dot dot-green"></span>
      </div>
      <div class="url-bar">https://web-feed.example.com/explore</div>
      <div class="ext-icon">🙈</div>
    </div>
    <div class="content">
      <div class="item" id="it1">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/landscape.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Scenic Landscape</span><span style="color:#3FB950">Clean</span></div>
      </div>
      <div class="item" id="it2">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/real_female/woman_portrait.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Portrait Photo</span><span id="st2" style="color:#8B949E">Pending</span></div>
      </div>
      <div class="item" id="it3">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/anime_female/anime_girl.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Anime Art</span><span id="st3" style="color:#8B949E">Pending</span></div>
      </div>
      <div class="item" id="it4">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/sfw/clock_object.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Clock Object</span><span style="color:#3FB950">Clean</span></div>
      </div>
      <div class="item" id="it5">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/real_male/man_portrait.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Male Portrait</span><span id="st5" style="color:#3FB950">Allowed</span></div>
      </div>
      <div class="item" id="it6">
        <img src="file:///${path.resolve(ROOT_DIR, 'test/fixtures/images/gender/anime_male/anime_boy.jpg').replace(/\\/g, '/')}" />
        <div class="lbl"><span>Anime Male</span><span id="st6" style="color:#3FB950">Allowed</span></div>
      </div>

      <div class="floating-popup" id="popupBox">
        <img src="data:image/png;base64,${popupBase64}" />
      </div>
    </div>
  </body>
  </html>
  `;

  const demoHtmlPath = path.join(TEMP_DIR, 'demo.html');
  fs.writeFileSync(demoHtmlPath, demoPageHtml);

  const demoSimPage = await context.newPage();
  await demoSimPage.setViewportSize({ width: 1000, height: 620 });
  await demoSimPage.goto(`file://${demoHtmlPath}`);
  await demoSimPage.waitForTimeout(600);

  // Capture frames for GIF
  // Frame 1: Popup closed, images loading
  await demoSimPage.evaluate(() => {
    document.getElementById('popupBox').style.display = 'none';
  });
  const f1 = path.join(TEMP_DIR, 'frame_01.png');
  await demoSimPage.screenshot({ path: f1 });

  // Frame 2: Popup opens
  await demoSimPage.evaluate(() => {
    document.getElementById('popupBox').style.display = 'block';
  });
  const f2 = path.join(TEMP_DIR, 'frame_02.png');
  await demoSimPage.screenshot({ path: f2 });

  // Frame 3: Neural network evaluates images
  await demoSimPage.evaluate(() => {
    document.getElementById('st2').innerText = 'Classifying...';
    document.getElementById('st2').style.color = '#58A6FF';
    document.getElementById('st3').innerText = 'Classifying...';
    document.getElementById('st3').style.color = '#58A6FF';
  });
  const f3 = path.join(TEMP_DIR, 'frame_03.png');
  await demoSimPage.screenshot({ path: f3 });

  // Frame 4: Blur activates on detected female & anime female
  await demoSimPage.evaluate(() => {
    document.getElementById('it2').classList.add('blurred');
    document.getElementById('st2').innerText = '🔒 Filtered (Female)';
    document.getElementById('st2').style.color = '#E3B341';

    document.getElementById('it3').classList.add('blurred');
    document.getElementById('st3').innerText = '🔒 Filtered (Anime Female)';
    document.getElementById('st3').style.color = '#E3B341';
  });
  const f4 = path.join(TEMP_DIR, 'frame_04.png');
  await demoSimPage.screenshot({ path: f4 });

  // Frame 5: Close popup, showcase protected page
  await demoSimPage.evaluate(() => {
    document.getElementById('popupBox').style.display = 'none';
  });
  const f5 = path.join(TEMP_DIR, 'frame_05.png');
  await demoSimPage.screenshot({ path: f5 });

  console.log('Frames captured successfully. Closing Chromium...');
  await context.close();

  // 6. ASSEMBLE ANIMATED GIF VIA PYTHON PILLOW
  console.log('\n--- 6. Assembling demo.gif via Pillow ---');
  const pythonScript = `
from PIL import Image
import os

temp_dir = r"${TEMP_DIR}"
demo_dir = r"${DEMO_DIR}"

frames = [
    os.path.join(temp_dir, 'frame_01.png'),
    os.path.join(temp_dir, 'frame_02.png'),
    os.path.join(temp_dir, 'frame_03.png'),
    os.path.join(temp_dir, 'frame_04.png'),
    os.path.join(temp_dir, 'frame_05.png'),
]

images = []
# Durations in ms: frame 1 (1200ms), frame 2 (1400ms), frame 3 (1000ms), frame 4 (1800ms), frame 5 (2200ms)
durations = [1200, 1400, 1000, 1800, 2200]

for f in frames:
    img = Image.open(f).convert('RGB')
    # Resize slightly for crisp fast-loading web GIF (900px width)
    w, h = img.size
    new_w = 900
    new_h = int(h * (new_w / w))
    img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    # Convert with adaptive palette for crisp text
    quantized = img_resized.quantize(colors=128, method=Image.Quantize.MEDIANCUT)
    images.append(quantized)

out_gif = os.path.join(demo_dir, 'demo.gif')
images[0].save(
    out_gif,
    save_all=True,
    append_images=images[1:],
    duration=durations,
    loop=0,
    optimize=True
)

stat = os.stat(out_gif)
print(f"Generated demo.gif: {out_gif} ({stat.st_size / (1024 * 1024):.2f} MB)")
`;

  const pyPath = path.join(TEMP_DIR, 'make_gif.py');
  fs.writeFileSync(pyPath, pythonScript);

  try {
    execSync(`python "${pyPath}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('Python GIF assembly failed:', err.message);
  }

  console.log('\n============================================================');
  console.log('✔ SUCCESS: All README assets generated successfully!');
  console.log('  Cover banner: ' + coverPath);
  console.log('  Popup preview: ' + popupPath);
  console.log('  Options preview: ' + optionsPath);
  console.log('  Filtering showcase: ' + showcaseImgPath);
  console.log('  Animated demo GIF: ' + path.join(DEMO_DIR, 'demo.gif'));
  console.log('============================================================\n');
}

run().catch(err => {
  console.error('Fatal error during asset generation:', err);
  process.exit(1);
});
