# <img src="dist/images/icon32.png" width="28" align="middle" alt=""> DontShowMe (v1.0.0)

A privacy-focused, 100% client-side browser extension that filters explicit web content and conditionally blurs images based on detected gender and character category (real female/male, anime female/male).

All classifications run locally in your browser using TensorFlow.js (WebGL with CPU WASM fallback). Zero telemetry, no remote servers, and zero images ever leave your device.

---

## Table of Contents

- [Introduction](#-dontshowme-v100)
- [Download Here](#download-here)
- [How to Install](#how-to-install)
  - [Method 1: Chrome Web Store (Recommended)](#method-1-chrome-web-store-recommended)
  - [Method 2: Install Pre-Packaged ZIP](#method-2-install-pre-packaged-zip)
  - [Method 3: Build & Install from Source](#method-3-build--install-from-source)
- [Features](#features)
- [Why This Extension Exists](#why-this-extension-exists)
- [Filtering Pipeline & Architecture](#filtering-pipeline--architecture)
- [Replacing the Classifier with Your Own Model](#replacing-the-classifier-with-your-own-model)
- [Converting Models: ONNX to TensorFlow.js](#converting-models-onnx-to-tensorflowjs)
- [Development & Automated Testing](#development--automated-testing)
- [Packaging for Google Chrome Web Store](#packaging-for-google-chrome-web-store)
- [Credits & Attribution](#credits--attribution)
- [License](#license)

---

## Download Here

Get the latest release of **DontShowMe**:

- **Google Chrome Web Store** *(Store listing submission)*:  
  [![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Add_to_Chrome-blue?style=for-the-badge&logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/<extension-id>)  
  *Once published, click "Add to Chrome" to install automatically with auto-updates.*

- **Direct ZIP Package (GitHub Releases)**:  
  Download the latest pre-packaged, verified build directly from GitHub:  
  👉 **[Download dontshowme-v1.0.0.zip](https://github.com/haichteque/dont-show-me/releases/latest/download/dontshowme-v1.0.0.zip)**  
  *(For manual installation in Chrome via Developer Mode)*

---

## How to Install

### Method 1: Chrome Web Store (Recommended)
1. Open the [DontShowMe Chrome Web Store Page](https://chromewebstore.google.com/detail/<extension-id>).
2. Click **Add to Chrome**.
3. Confirm the prompt to add the extension.
4. Pin **DontShowMe** to your Chrome toolbar for easy access to settings and filtering controls.

### Method 2: Install Pre-Packaged ZIP
1. Download `dontshowme-v1.0.0.zip` from [Download Here](#download-here) or [Releases](https://github.com/haichteque/dont-show-me/releases).
2. Extract the ZIP file to a permanent directory on your computer.
3. In Google Chrome, go to `chrome://extensions` in the address bar.
4. Enable **Developer mode** using the toggle switch in the top-right corner.
5. Click the **Load unpacked** button in the top-left corner.
6. Select the extracted folder (the directory containing `manifest.json`).

### Method 3: Build & Install from Source
If you are developing or customizing the model:

```bash
# 1. Clone repository
git clone https://github.com/haichteque/dont-show-me.git
cd dont-show-me

# 2. Install dependencies
npm install

# 3. Build production bundle
npm run build

# 4. Load unpacked in Chrome
# Open chrome://extensions, enable "Developer mode", click "Load unpacked",
# and select the dist/ directory in this repo.
```

---

## Features

- **5-Class Recognition**: Accurately classifies safe images into `real_male`, `real_female`, `anime_male`, `anime_female`, and `other`.
- **Dual-Stage Safety Pass**: ViT Vision Transformer and MobileNet v1.2 inspect images for explicit adult content, hentai, and provocative imagery.
- **Granular Controls**: Toggle overall protection, filter by gender (blur females, blur males), and tune individual classes or confidence thresholds via the popup interface.
- **Pure Local Inference**: Runs via TensorFlow.js in a Manifest V3 offscreen document on the GPU (WebGL) with automatic CPU WebAssembly fallback.
- **Privacy-First**: Zero tracking, zero telemetry, no external server calls. Images are analyzed purely in-memory.

---

## Why This Extension Exists

Standard web content filters are strictly binary: they detect nudity or adult content, but offer no mechanism to filter or blur images by subject presentation. 

This repository introduces an on-device **5-class character & gender classification pipeline** directly behind the safety classifier:
1. **Safety Pass**: Analyzes the image for explicit / adult content. If flagged, the image is blurred immediately.
2. **Gender & Character Pass**: If the image is safe, it is evaluated by a multi-class model classifying into `real_male`, `real_female`, `anime_male`, `anime_female`, and `other`.
3. **Selective Blurring**: Images matching the user's active preferences (e.g., blurring anime females, anime males, or specific classes) are automatically blurred with a clean `blur(25px)` effect.

---

## Filtering Pipeline & Architecture

```
[Web Page Image]
       │
       ▼
[Stage 1: Safety Classifier (ViT_NSFW_384 / MobileNet)]
       │
   Is Explicit?
  ├─── YES ───► [Blur Image (Adult/NSFW Content)]
  └─── NO  ───► [Stage 2: 5-Class Gender Classifier]
                        │
                  Predict Class:
                  • real_male
                  • real_female
                  • anime_male
                  • anime_female
                  • other
                        │
                Matches Active Filters?
               ├─── YES ───► [Blur Image (blur(25px))]
               └─── NO  ───► [Display Image Untouched]
```

---

## Replacing the Classifier with Your Own Model

The gender classifier model is located in:
```text
dist/models/gender/
├── model.json
├── group1-shard1of3.bin
├── group1-shard2of3.bin
└── group1-shard3of3.bin
```

To replace it with a custom model:

1. **Place Model Files**: Convert your model to a TensorFlow.js GraphModel (see instructions below) and place the `model.json` and `.bin` shard files into `dist/models/gender/`.
2. **Update Class Definitions**: Open `src/offscreen/classifiers/GenderClassifier.ts` and update `GENDER_CLASSES` to match your model's output labels:
   ```typescript
   export const GENDER_CLASSES: GenderClass[] = [
     'real_male',
     'real_female',
     'anime_male',
     'anime_female',
     'other'
   ]
   ```
3. **Adjust Resolution & Preprocessing** (if needed):
   ```typescript
   const INPUT_SIZE = 256 // update to match your model's expected input dimension
   ```
   If your model requires custom normalization (e.g., ImageNet mean/std), ensure it is applied either within the graph or inside `genderProbabilities()` in `GenderClassifier.ts`.
4. **Rebuild**:
   ```bash
   npm run build
   ```

---

## Converting Models: ONNX to TensorFlow.js

If you have a trained model in `.onnx` format, convert it to a native TensorFlow.js GraphModel with these steps:

### 1. Install Prerequisites
```bash
pip install onnx onnx2tf tensorflow tensorflowjs
```

### 2. Convert ONNX to TensorFlow SavedModel
Use [`onnx2tf`](https://github.com/PINTO0309/onnx2tf) to export an optimized SavedModel:
```bash
onnx2tf -in model.onnx -o saved_model/ -coion -nuo
```

> **Note for Windows users**: If using TensorFlow 2.21+, ensure `dilations` in depthwise convolution layers are 2D `[dh, dw]` rather than 4D to avoid rank errors during export.

### 3. Convert SavedModel to TensorFlow.js GraphModel
```bash
tensorflowjs_converter \
  --input_format=tf_saved_model \
  --output_format=tfjs_graph_model \
  --weight_shard_size_bytes=4194304 \
  saved_model/ \
  dist/models/gender/
```

This generates `model.json` alongside 4 MB `.bin` binary shard files ready for consumption by TensorFlow.js.

---

## Development & Automated Testing

### Running Tests
Every push and pull request triggers continuous integration testing through GitHub Actions.

```bash
# Run Jest unit tests (17 test suites, 169 tests)
npm run test:unit

# Run automated image classification test suite
# (Evaluates NSFW, SFW, Gender, and False Positive image suites)
npm run test:images

# Run complete test suite (Unit + Image Tests + E2E)
npm test

# Run Playwright end-to-end browser verification
npm run test:gender:e2e
```

### CI/CD Pipeline
Continuous integration is configured in `.github/workflows/integrate.yml`:
- Runs on every `push` and `pull_request` to `master` and `main`.
- Validates linting (`npm run lint`).
- Builds the production bundle (`npm run build`).
- Executes unit tests (`npm run test:unit`).
- Evaluates the real image test suite (`npm run test:images`) across all categories.
- Validates the Chrome Web Store extension package (`npm run package:verify`).

---

## Packaging for Google Chrome Web Store

To produce a production-ready `.zip` package acceptable for uploading to the Chrome Web Store developer dashboard:

```bash
npm run package
```

This script:
1. Builds a fresh production bundle in `dist/`.
2. Validates `manifest.json` schema, Manifest V3 compliance, icons, and permissions.
3. Ensures `manifest.json` is at the root of the archive.
4. Validates that the package size is well within the 128 MB Chrome Web Store limit.
5. Generates the release ZIP file at `package/dontshowme-v1.0.0.zip`.

---

## Credits & Attribution

- This project is a downstream fork of [**NSFW Filter**](https://github.com/nsfw-filter/nsfw-filter), originally created by [Navendu Pottekkat](https://github.com/navendu-pottekkat), [Yegor Zaremba](https://github.com/YegorZaremba), and the NSFW Filter open-source contributors.
- The default 5-class gender and anime classification weights are based on the [`gender4-whole-image-5class`](https://huggingface.co/haichteque/gender4-whole-image-5class) model by `haichteque`.

---

## License

This project is licensed under the [GNU General Public License v3.0 (GPL-3.0)](LICENSE).
