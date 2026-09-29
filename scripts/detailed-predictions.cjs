const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const IMAGES_DIR = path.resolve(__dirname, '..', 'test-eval-images');
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const TFJS_PATH = path.resolve(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs', 'dist', 'tf.min.js');
const NSFWJS_PATH = path.resolve(__dirname, '..', 'node_modules', 'nsfwjs', 'dist', 'browser', 'nsfwjs.min.js');

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.replace(/^\//, ''));
  let filePath = '';
  if (urlPath === 'tf.min.js') filePath = TFJS_PATH;
  else if (urlPath === 'nsfwjs.min.js') filePath = NSFWJS_PATH;
  else if (urlPath.startsWith('models/')) filePath = path.join(DIST_DIR, urlPath);
  else filePath = path.join(IMAGES_DIR, urlPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
    else if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not found: ' + filePath);
  }
});

async function main() {
  await new Promise(resolve => server.listen(8767, resolve));
  console.log('HTTP Server on http://127.0.0.1:8767');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="http://127.0.0.1:8767/tf.min.js"></script>
        <script src="http://127.0.0.1:8767/nsfwjs.min.js"></script>
      </head>
      <body>
        <canvas id="c"></canvas>
      </body>
    </html>
  `);

  await page.waitForFunction(() => typeof tf !== 'undefined' && typeof nsfwjs !== 'undefined');
  console.log('TFJS and NSFWJS loaded in browser environment successfully.');

  const imageFiles = fs.readdirSync(IMAGES_DIR);

  const results = await page.evaluate(async (files) => {
    // 1. Load ViT model
    const vitModel = await tf.loadGraphModel('http://127.0.0.1:8767/models/marqo/model.json');
    // 2. Load MobileNet nsfwjs model
    const nsfwModel = await nsfwjs.load('http://127.0.0.1:8767/models/', { type: 'graph' });
    // 3. Load Gender model
    const genderModel = await tf.loadGraphModel('http://127.0.0.1:8767/models/gender/model.json');

    const GENDER_CLASSES = ['real_male', 'real_female', 'anime_male', 'anime_female', 'other'];
    const report = [];

    for (const f of files) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = 'http://127.0.0.1:8767/' + f;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
      });

      // ViT inference
      const vitProb = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(img);
        const resized = tf.image.resizeBilinear(pixels, [384, 384]);
        const normalized = resized.toFloat().div(255).sub(0.5).div(0.5).expandDims(0);
        const logits = vitModel.predict(normalized);
        return tf.softmax(logits).reshape([2]).slice([0], [1]).dataSync()[0];
      });

      // MobileNet nsfwjs inference
      const mobilenetPred = await nsfwModel.classify(img, 5);

      // Gender inference
      const genderScores = tf.tidy(() => {
        const pixels = tf.browser.fromPixels(img);
        const resized = tf.image.resizeBilinear(pixels, [256, 256]);
        const normalized = resized.toFloat().div(255.0).expandDims(0);
        const out = genderModel.predict(normalized);
        return Array.from(out.dataSync());
      });

      const genderObj = {};
      GENDER_CLASSES.forEach((cls, i) => {
        genderObj[cls] = genderScores[i];
      });

      report.push({
        file: f,
        vitNsfwProb: vitProb,
        mobilenetClasses: mobilenetPred,
        genderScores: genderObj
      });
    }

    return report;
  }, imageFiles);

  console.log('\n======================================================================');
  console.log('DETAILED EMPIRICAL EVALUATION REPORT ACROSS ALL CLASSIFIERS');
  console.log('======================================================================');

  for (const r of results) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`IMAGE: ${r.file}`);
    console.log(`------------------------------------------------------------`);

    console.log(`1. ViT_NSFW_384 (Marqo Vision Transformer - Default Safety Model):`);
    console.log(`   - NSFW Probability: ${(r.vitNsfwProb * 100).toFixed(2)}% | SFW: ${((1 - r.vitNsfwProb) * 100).toFixed(2)}%`);
    console.log(`   - Strictness 55 Threshold: 52.73%`);
    console.log(`   - Verdict: ${r.vitNsfwProb >= 0.5273 ? '*** FALSE POSITIVE: BLOCKED AS NSFW ***' : 'SAFE (Passed)'}`);

    console.log(`\n2. MobileNet_v1.2 (nsfwjs 5-class - BlurItAll / Legacy Model):`);
    for (const c of r.mobilenetClasses) {
      console.log(`   - ${c.className.padEnd(8)}: ${(c.probability * 100).toFixed(2)}%`);
    }
    const top1 = r.mobilenetClasses[0];
    const top2 = r.mobilenetClasses[1];
    const isFirstNsfw = ['Hentai', 'Porn', 'Sexy'].includes(top1.className) && top1.probability > (top1.className === 'Porn' ? 0.67 : 0.78);
    const isSecondNsfw = ['Hentai', 'Porn', 'Sexy'].includes(top2.className) && top2.probability > (top2.className === 'Porn' ? 0.3075 : 0.3625);
    const nsfwjsVerdict = isFirstNsfw || isSecondNsfw;
    console.log(`   - Model.ts Verdict: ${nsfwjsVerdict ? '*** FALSE POSITIVE: BLOCKED AS NSFW ***' : 'SAFE (Passed)'}`);
    if (nsfwjsVerdict) {
      console.log(`     Reason triggered: ${isFirstNsfw ? `Top class ${top1.className} exceeded first threshold` : `Second class ${top2.className} (${(top2.probability*100).toFixed(1)}%) exceeded second threshold (${(top2.className === 'Porn' ? 30.75 : 36.25)}%)`}`);
    }

    console.log(`\n3. Gender & Character Classifier (gender4-whole-image-5class):`);
    let maxGCls = '';
    let maxGScore = -1;
    for (const [k, v] of Object.entries(r.genderScores)) {
      console.log(`   - ${k.padEnd(14)}: ${(v * 100).toFixed(2)}%`);
      if (v > maxGScore) {
        maxGScore = v;
        maxGCls = k;
      }
    }
    console.log(`   - Top Predicted Class: ${maxGCls} (${(maxGScore * 100).toFixed(1)}%)`);
  }

  await browser.close();
  server.close();
}

main().catch(err => {
  console.error(err);
  server.close();
  process.exit(1);
});
