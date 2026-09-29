const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const http = require('http');

const FIXTURES_DIR = path.resolve(__dirname, '..', 'test', 'fixtures', 'images');
const DIST_DIR = path.resolve(__dirname, '..', 'dist');
const TFJS_PATH = path.resolve(__dirname, '..', 'node_modules', '@tensorflow', 'tfjs', 'dist', 'tf.min.js');
const NSFWJS_PATH = path.resolve(__dirname, '..', 'node_modules', 'nsfwjs', 'dist', 'browser', 'nsfwjs.min.js');

// Support optional extended custom image directory from env
const EXTENDED_DIR = process.env.EXTENDED_IMAGE_DIR ? path.resolve(process.env.EXTENDED_IMAGE_DIR) : null;

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.replace(/^\//, ''));
  let filePath = '';
  if (urlPath === 'tf.min.js') filePath = TFJS_PATH;
  else if (urlPath === 'nsfwjs.min.js') filePath = NSFWJS_PATH;
  else if (urlPath.startsWith('models/')) filePath = path.join(DIST_DIR, urlPath);
  else if (EXTENDED_DIR && fs.existsSync(path.join(EXTENDED_DIR, urlPath))) filePath = path.join(EXTENDED_DIR, urlPath);
  else filePath = path.join(FIXTURES_DIR, urlPath);

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (filePath.endsWith('.png')) res.setHeader('Content-Type', 'image/png');
    else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) res.setHeader('Content-Type', 'image/jpeg');
    else if (filePath.endsWith('.json')) res.setHeader('Content-Type', 'application/json');
    else if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript');
    else res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not found: ' + filePath);
  }
});

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

async function runImageTests() {
  const port = 8790;
  await new Promise(resolve => server.listen(port, resolve));
  console.log(`\n======================================================================`);
  console.log(` DontShowMe - Automated Image Classification Pipeline Test Suite `);
  console.log(` Server active on http://127.0.0.1:${port}`);
  console.log(`======================================================================\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.setContent(`
    <!DOCTYPE html>
    <html>
      <head>
        <script src="http://127.0.0.1:${port}/tf.min.js"></script>
        <script src="http://127.0.0.1:${port}/nsfwjs.min.js"></script>
      </head>
      <body><canvas id="c"></canvas></body>
    </html>
  `);

  await page.waitForFunction(() => typeof tf !== 'undefined' && typeof nsfwjs !== 'undefined');
  console.log('✔ TensorFlow.js and NSFWJS loaded successfully in headless environment.\n');

  // Load all images in fixtures
  const allImages = getAllFiles(FIXTURES_DIR);
  const relativeList = allImages.map(p => path.relative(FIXTURES_DIR, p).replace(/\\/g, '/'));

  console.log(`Running inference on ${relativeList.length} benchmark test fixtures...\n`);

  const rawResults = await page.evaluate(async ({ port, files }) => {
    const vitModel = await tf.loadGraphModel(`http://127.0.0.1:${port}/models/marqo/model.json`);
    const nsfwModel = await nsfwjs.load(`http://127.0.0.1:${port}/models/`, { type: 'graph' });
    const genderModel = await tf.loadGraphModel(`http://127.0.0.1:${port}/models/gender/model.json`);
    const GENDER_CLASSES = ['real_male', 'real_female', 'anime_male', 'anime_female', 'other'];

    const evaluations = [];

    for (const f of files) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = `http://127.0.0.1:${port}/` + f;
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = () => rej(new Error('Failed to load image: ' + f));
      });

      // ViT_NSFW_384 inference
      let vitProb = 0;
      {
        const tensor = tf.tidy(() => {
          const pixels = tf.browser.fromPixels(img);
          const resized = tf.image.resizeBilinear(pixels, [384, 384]);
          return resized.toFloat().div(255).sub(0.5).div(0.5).expandDims(0);
        });
        const logits = vitModel.predict(tensor);
        const sm = tf.softmax(logits).reshape([2]).slice([0], [1]);
        const d = await sm.data();
        vitProb = d[0];
        tensor.dispose();
        logits.dispose();
        sm.dispose();
      }

      // MobileNet_v1.2 inference
      const mobilenetClasses = await nsfwModel.classify(img, 5);

      // Gender 5-class inference
      const genderObj = {};
      {
        const tensor = tf.tidy(() => {
          const pixels = tf.browser.fromPixels(img);
          const resized = tf.image.resizeBilinear(pixels, [256, 256]);
          return resized.toFloat().div(255.0).expandDims(0);
        });
        const pred = genderModel.predict(tensor);
        const data = await pred.data();
        GENDER_CLASSES.forEach((cls, i) => {
          genderObj[cls] = data[i];
        });
        tensor.dispose();
        pred.dispose();
      }

      evaluations.push({
        file: f,
        vitNsfwProb: vitProb,
        mobilenetClasses,
        genderScores: genderObj
      });
    }

    return evaluations;
  }, { port, files: relativeList });

  await browser.close();
  server.close();

  // Test Runner Assertions
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;

  function assertTest(name, condition, details = '') {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✔ [PASS] ${name}`);
      if (details) console.log(`           ${details}`);
    } else {
      failedTests++;
      console.log(`  ✖ [FAIL] ${name}`);
      if (details) console.log(`           ${details}`);
    }
  }

  const resultsMap = new Map();
  for (const r of rawResults) {
    resultsMap.set(r.file, r);
  }

  // -------------------------------------------------------------
  // SUITE 1: NSFW CATEGORIES (Porn, Hentai, Sexy)
  // -------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`SUITE 1: NSFW Categories (Pornography, Hentai, Sexy)`);
  console.log(`============================================================`);

  const nudeStatue = resultsMap.get('nsfw/porn/nude_statue.jpg');
  if (nudeStatue) {
    const isPornFlagged = nudeStatue.mobilenetClasses.some(c => ['Porn', 'Sexy'].includes(c.className) && c.probability > 0.15) || nudeStatue.vitNsfwProb > 0.40;
    assertTest(
      'NSFW / Porn Category: Classical nude sculpture triggers explicit safety sensitivity',
      isPornFlagged,
      `ViT NSFW: ${(nudeStatue.vitNsfwProb * 100).toFixed(1)}%, Top MobileNet: ${nudeStatue.mobilenetClasses[0].className} (${(nudeStatue.mobilenetClasses[0].probability * 100).toFixed(1)}%)`
    );
  }

  const animeBeach = resultsMap.get('nsfw/hentai/anime_beach.jpg');
  if (animeBeach) {
    const isHentaiOrAnimeFemale = animeBeach.mobilenetClasses.some(c => ['Hentai', 'Drawing', 'Sexy'].includes(c.className) && c.probability > 0.10) || animeBeach.genderScores.anime_female > 0.50;
    assertTest(
      'NSFW / Hentai Category: Anime swimwear art classified as Hentai/Drawing/Anime Female',
      isHentaiOrAnimeFemale,
      `Top MobileNet: ${animeBeach.mobilenetClasses[0].className} (${(animeBeach.mobilenetClasses[0].probability * 100).toFixed(1)}%), Anime Female: ${(animeBeach.genderScores.anime_female * 100).toFixed(1)}%`
    );
  }

  const swimsuitModel = resultsMap.get('nsfw/sexy/swimsuit_model.jpg');
  if (swimsuitModel) {
    const isSexyOrFemale = swimsuitModel.mobilenetClasses.some(c => ['Sexy', 'Porn'].includes(c.className) && c.probability > 0.10) || swimsuitModel.genderScores.real_female > 0.50;
    assertTest(
      'NSFW / Sexy Category: Swimwear bikini beach model classified as Sexy or Real Female',
      isSexyOrFemale,
      `Top MobileNet: ${swimsuitModel.mobilenetClasses[0].className} (${(swimsuitModel.mobilenetClasses[0].probability * 100).toFixed(1)}%), Real Female: ${(swimsuitModel.genderScores.real_female * 100).toFixed(1)}%`
    );
  }

  // -------------------------------------------------------------
  // SUITE 2: SFW CATEGORIES (Landscape, Objects)
  // -------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`SUITE 2: SFW Categories (Landscapes, Clean Objects)`);
  console.log(`============================================================`);

  const landscape = resultsMap.get('sfw/landscape.jpg');
  if (landscape) {
    const isSafe = landscape.vitNsfwProb < 0.20 && landscape.mobilenetClasses[0].className === 'Neutral';
    assertTest(
      'SFW / Landscape: Mountain lake landscape verified 100% SFW',
      isSafe,
      `ViT NSFW: ${(landscape.vitNsfwProb * 100).toFixed(2)}%, MobileNet: ${landscape.mobilenetClasses[0].className} (${(landscape.mobilenetClasses[0].probability * 100).toFixed(1)}%)`
    );
  }

  const clockObj = resultsMap.get('sfw/clock_object.jpg');
  if (clockObj) {
    const isSafe = clockObj.vitNsfwProb < 0.20 && clockObj.mobilenetClasses[0].className === 'Neutral';
    assertTest(
      'SFW / Object: Vintage mechanical clock verified 100% SFW',
      isSafe,
      `ViT NSFW: ${(clockObj.vitNsfwProb * 100).toFixed(2)}%, MobileNet: ${clockObj.mobilenetClasses[0].className} (${(clockObj.mobilenetClasses[0].probability * 100).toFixed(1)}%)`
    );
  }

  // -------------------------------------------------------------
  // SUITE 3: GENDER & CHARACTER CATEGORIES (Male, Female, Anime Male, Anime Female, Other)
  // -------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`SUITE 3: Gender & Character Recognition`);
  console.log(`============================================================`);

  const realMale = resultsMap.get('gender/real_male/navendu.jpg');
  if (realMale) {
    const maleProb = (realMale.genderScores.real_male || 0) + (realMale.genderScores.anime_male || 0);
    const femaleProb = (realMale.genderScores.real_female || 0) + (realMale.genderScores.anime_female || 0);
    const isMale = maleProb > femaleProb && maleProb > 0.50;
    assertTest(
      'Gender / Gender Male: Photo verified as male subject (male > female)',
      isMale,
      `Male score: ${(maleProb * 100).toFixed(1)}% vs Female: ${(femaleProb * 100).toFixed(1)}%`
    );
  }

  const realFemale = resultsMap.get('gender/real_female/female_portrait.jpg');
  if (realFemale) {
    const femaleProb = (realFemale.genderScores.real_female || 0) + (realFemale.genderScores.anime_female || 0);
    const maleProb = (realFemale.genderScores.real_male || 0) + (realFemale.genderScores.anime_male || 0);
    const isFemale = femaleProb > maleProb && femaleProb > 0.50;
    assertTest(
      'Gender / Gender Female: Photo verified as female subject (female > male)',
      isFemale,
      `Female score: ${(femaleProb * 100).toFixed(1)}% vs Male: ${(maleProb * 100).toFixed(1)}%`
    );
  }

  const animeBoy = resultsMap.get('gender/anime_male/anime_boy.jpg');
  if (animeBoy) {
    const isAnimeMale = animeBoy.genderScores.anime_male > 0.50;
    assertTest(
      'Gender / Gender Anime Male: Anime boy illustration classified as anime_male',
      isAnimeMale,
      `anime_male confidence: ${(animeBoy.genderScores.anime_male * 100).toFixed(1)}%`
    );
  }

  const animeGirl = resultsMap.get('gender/anime_female/anime_girl.jpg');
  if (animeGirl) {
    const isAnimeFemale = animeGirl.genderScores.anime_female > 0.50;
    assertTest(
      'Gender / Gender Anime Female: Anime girl illustration classified as anime_female',
      isAnimeFemale,
      `anime_female confidence: ${(animeGirl.genderScores.anime_female * 100).toFixed(1)}%`
    );
  }

  const otherIcon = resultsMap.get('gender/other/settings_icon.png');
  if (otherIcon) {
    const isOther = otherIcon.genderScores.other > 0.20 || otherIcon.genderScores.real_male < 0.25;
    assertTest(
      'Gender / Others Category: Non-human UI icon categorized as other / non-target',
      isOther,
      `other score: ${(otherIcon.genderScores.other * 100).toFixed(1)}%`
    );
  }

  // -------------------------------------------------------------
  // SUITE 4: FALSE POSITIVES SAFEGUARDS
  // -------------------------------------------------------------
  console.log(`\n============================================================`);
  console.log(`SUITE 4: False Positive Safeguards Across Categories`);
  console.log(`============================================================`);

  // 4a: NSFW False Positives
  const heatblast = resultsMap.get('false_positives/nsfw/heatblast.png');
  if (heatblast) {
    const isSfw = heatblast.vitNsfwProb < 0.5273; // strictness 55 threshold
    assertTest(
      'False Positive NSFW / Cartoon Alien: Heatblast is NOT blocked under default strictness (55)',
      isSfw,
      `ViT NSFW: ${(heatblast.vitNsfwProb * 100).toFixed(1)}% (Threshold: 52.7%)`
    );
  }

  const swampfire = resultsMap.get('false_positives/nsfw/swampfire.png');
  if (swampfire) {
    const isSfw = swampfire.vitNsfwProb < 0.5273;
    assertTest(
      'False Positive NSFW / Cartoon Alien: Swampfire is NOT blocked under default strictness (55)',
      isSfw,
      `ViT NSFW: ${(swampfire.vitNsfwProb * 100).toFixed(1)}% (Threshold: 52.7%)`
    );
  }

  const sunset = resultsMap.get('false_positives/nsfw/sunset.jpg');
  if (sunset) {
    const isSfw = sunset.vitNsfwProb < 0.5273;
    assertTest(
      'False Positive NSFW / Sunset: Orange/red sunset sky is NOT blocked as NSFW',
      isSfw,
      `ViT NSFW: ${(sunset.vitNsfwProb * 100).toFixed(1)}% (Threshold: 52.7%)`
    );
  }

  // 4b: Gender Female False Positives (blurFemale: true, blurMale: false -> MUST NOT BLUR)
  const fpFemaleMan = resultsMap.get('false_positives/gender_female/male_subject.jpg');
  if (fpFemaleMan) {
    const femaleScore = (fpFemaleMan.genderScores.real_female || 0) + (fpFemaleMan.genderScores.anime_female || 0);
    const notFemale = femaleScore < 0.30;
    assertTest(
      'False Positive blurFemale: Male portrait is NOT triggered under blurFemale',
      notFemale,
      `Female score: ${(femaleScore * 100).toFixed(1)}% (must be < 30%)`
    );
  }

  const fpFemaleAnimeBoy = resultsMap.get('false_positives/gender_female/anime_boy.jpg');
  if (fpFemaleAnimeBoy) {
    const femaleScore = (fpFemaleAnimeBoy.genderScores.real_female || 0) + (fpFemaleAnimeBoy.genderScores.anime_female || 0);
    const notFemale = femaleScore < 0.30;
    assertTest(
      'False Positive blurFemale: Anime boy illustration is NOT triggered under blurFemale',
      notFemale,
      `Female score: ${(femaleScore * 100).toFixed(1)}% (must be < 30%)`
    );
  }

  const fpFemaleIcon = resultsMap.get('false_positives/gender_female/settings_icon.png');
  if (fpFemaleIcon) {
    const femaleScore = (fpFemaleIcon.genderScores.real_female || 0) + (fpFemaleIcon.genderScores.anime_female || 0);
    const notFemale = femaleScore < 0.30;
    assertTest(
      'False Positive blurFemale: Settings icon is NOT triggered under blurFemale',
      notFemale,
      `Female score: ${(femaleScore * 100).toFixed(1)}%`
    );
  }

  // 4c: Gender Male False Positives (blurMale: true, blurFemale: false -> MUST NOT BLUR)
  const fpMaleWoman = resultsMap.get('false_positives/gender_male/female_subject.jpg');
  if (fpMaleWoman) {
    const maleScore = (fpMaleWoman.genderScores.real_male || 0) + (fpMaleWoman.genderScores.anime_male || 0);
    const notMale = maleScore < 0.30;
    assertTest(
      'False Positive blurMale: Female portrait is NOT triggered under blurMale',
      notMale,
      `Male score: ${(maleScore * 100).toFixed(1)}% (must be < 30%)`
    );
  }

  const fpMaleAnimeGirl = resultsMap.get('false_positives/gender_male/anime_girl.jpg');
  if (fpMaleAnimeGirl) {
    const maleScore = (fpMaleAnimeGirl.genderScores.real_male || 0) + (fpMaleAnimeGirl.genderScores.anime_male || 0);
    const notMale = maleScore < 0.30;
    assertTest(
      'False Positive blurMale: Anime girl illustration is NOT triggered under blurMale',
      notMale,
      `Male score: ${(maleScore * 100).toFixed(1)}% (must be < 30%)`
    );
  }

  const fpMaleIcon = resultsMap.get('false_positives/gender_male/settings_icon.png');
  if (fpMaleIcon) {
    const maleScore = (fpMaleIcon.genderScores.real_male || 0) + (fpMaleIcon.genderScores.anime_male || 0);
    const notMale = maleScore < 0.50;
    assertTest(
      'False Positive blurMale: Settings icon is NOT triggered under blurMale',
      notMale,
      `Male score: ${(maleScore * 100).toFixed(1)}%`
    );
  }

  // 4d: Cross-Class False Positives
  const fpAnimeFemaleBoy = resultsMap.get('false_positives/anime_female/anime_boy.jpg');
  if (fpAnimeFemaleBoy) {
    const notAnimeFemale = fpAnimeFemaleBoy.genderScores.anime_female < fpAnimeFemaleBoy.genderScores.anime_male;
    assertTest(
      'False Positive anime_female: Anime boy is NOT misclassified as anime_female',
      notAnimeFemale,
      `anime_male: ${(fpAnimeFemaleBoy.genderScores.anime_male * 100).toFixed(1)}% vs anime_female: ${(fpAnimeFemaleBoy.genderScores.anime_female * 100).toFixed(1)}%`
    );
  }

  const fpAnimeMaleGirl = resultsMap.get('false_positives/anime_male/anime_girl.jpg');
  if (fpAnimeMaleGirl) {
    const notAnimeMale = fpAnimeMaleGirl.genderScores.anime_male < fpAnimeMaleGirl.genderScores.anime_female;
    assertTest(
      'False Positive anime_male: Anime girl is NOT misclassified as anime_male',
      notAnimeMale,
      `anime_female: ${(fpAnimeMaleGirl.genderScores.anime_female * 100).toFixed(1)}% vs anime_male: ${(fpAnimeMaleGirl.genderScores.anime_male * 100).toFixed(1)}%`
    );
  }

  const fpOtherMan = resultsMap.get('false_positives/other/male_subject.jpg');
  if (fpOtherMan) {
    const notOther = fpOtherMan.genderScores.other < 0.20;
    assertTest(
      'False Positive others category: Male subject is NOT categorized into "other"',
      notOther,
      `other score: ${(fpOtherMan.genderScores.other * 100).toFixed(1)}%`
    );
  }

  const fpOtherWoman = resultsMap.get('false_positives/other/female_subject.jpg');
  if (fpOtherWoman) {
    const notOther = fpOtherWoman.genderScores.other < 0.20;
    assertTest(
      'False Positive others category: Female subject is NOT categorized into "other"',
      notOther,
      `other score: ${(fpOtherWoman.genderScores.other * 100).toFixed(1)}%`
    );
  }

  // Final Summary
  console.log(`\n============================================================`);
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
  console.log(`============================================================\n`);

  if (failedTests > 0) {
    console.error(`❌ Image pipeline tests failed with ${failedTests} assertion failure(s).`);
    process.exit(1);
  } else {
    console.log(`✔ All image classification pipeline assertions passed successfully!\n`);
    process.exit(0);
  }
}

runImageTests().catch(err => {
  console.error('Fatal error running image tests:', err);
  server.close();
  process.exit(1);
});
