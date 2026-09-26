# <img src="demo/images/logo-mark.svg" width="34" align="middle" alt=""> Gender & Content Filter

A privacy-focused, 100% client-side browser extension that filters explicit web content and conditionally blurs images based on detected gender and character category (real female/male, anime female/male).

All classifications run locally in your browser using TensorFlow.js (WebGL with CPU WASM fallback). Zero telemetry, no remote servers, and zero images ever leave your device.

---

## Why This Repository Exists

Standard web content filters are strictly binary: they detect nudity or adult content, but offer no mechanism to filter or blur images by subject presentation. 

This repository was created to add an on-device **5-class character & gender classification pipeline** directly behind the safety classifier:
1. **Safety Pass**: Analyzes the image for explicit / adult content. If flagged, the image is blurred immediately.
2. **Gender & Character Pass**: If the image is safe, it is evaluated by a multi-class model classifying into `real_male`, `real_female`, `anime_male`, `anime_female`, and `other`.
3. **Selective Blurring**: Images matching the user's active preferences (e.g., blurring anime females, anime males, or specific classes) are automatically blurred with a clean `blur(25px)` effect.

---

## Features

- **5-Class Recognition**: Distinguishes real humans and animated/illustrated characters by gender.
- **Granular Controls**: Toggle protection, blur females, blur males, or select individual classes via the popup.
- **Pure Local Inference**: Runs via TensorFlow.js in a Manifest V3 offscreen document on the GPU (WebGL).
- **Fast & Lightweight**: Negligible latency per image without third-party network requests.

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

## Installation & Development

### 1. Build from Source
```bash
# Install dependencies
npm install

# Build production bundle
npm run build
```

### 2. Load into Chrome / Chromium
1. Navigate to `chrome://extensions` in your browser.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the `dist/` directory from this repository.

### 3. Testing
```bash
# Run unit tests
npm run test:unit

# Run Playwright end-to-end verification (Bing Image Search)
npm run test:gender:e2e
```

---

## Credits

- This project is a downstream fork of [**NSFW Filter**](https://github.com/nsfw-filter/nsfw-filter), originally created by [Navendu Pottekkat](https://github.com/navendu-pottekkat), [Yegor Zaremba](https://github.com/YegorZaremba), and the NSFW Filter open-source contributors.
- The default 5-class gender and anime classification weights are based on the [`gender4-whole-image-5class`](https://huggingface.co/haichteque/gender4-whole-image-5class) model by `haichteque`.
