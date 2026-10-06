# Third-party software and model notices — Candidate100

Audit status date: 2026-10-05

This file is a practical dependency/license inventory for the current browser OCR path. It is not legal advice and does not replace the upstream license texts. Candidate100 currently loads most OCR dependencies from third-party hosts at runtime rather than bundling their binaries into this ZIP; the notices are kept here for transparency and to prepare for any future self-hosting.

## Direct/runtime OCR dependencies

### Tesseract.js 5.1.1
- Project: https://github.com/naptha/tesseract.js
- Exact runtime worker package: `tesseract.js@5.1.1`
- License: Apache License 2.0
- License: https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/LICENSE.md

### tesseract.js-core 5.1.1
- Project/package: `tesseract.js-core@5.1.1`
- Runtime source: jsDelivr
- License: Apache License 2.0
- Note: binary distributions can include additional third-party components/notices; retain applicable upstream notices if self-hosting.

### Japanese / English Tesseract traineddata
- Runtime path pattern: `https://cdn.jsdelivr.net/npm/@tesseract.js-data/{jpn,eng}/4.0.0_best_int/{lang}.traineddata.gz`
- npm wrapper metadata observed during the 2026-10-05 audit: MIT
- Upstream `tessdata_best`: Apache License 2.0
- Upstream license: https://github.com/tesseract-ocr/tessdata_best/blob/main/LICENSE
- Note: the current URL does not pin the npm wrapper package version. This notice does not claim the wrapper MIT metadata supersedes the upstream model-data license.

### @paddleocr/paddleocr-js 0.4.2
- Runtime module: `https://cdn.jsdelivr.net/npm/@paddleocr/paddleocr-js@0.4.2/+esm`
- Project: https://github.com/PaddlePaddle/PaddleOCR
- License: Apache License 2.0

### ONNX Runtime Web
- Candidate100 explicit WASM path: `onnxruntime-web@1.26.0/dist/`
- Resolved JavaScript dependency observed from the PaddleOCR.js 0.4.2 `+esm` path on 2026-10-05: 1.26.0
- Project: https://github.com/microsoft/onnxruntime
- License: MIT
- Privacy information: https://github.com/microsoft/onnxruntime/blob/main/docs/Privacy.md

### @techstark/opencv-js 4.10.0-release.1
- Project: https://github.com/TechStark/opencv-js
- License: Apache License 2.0

### js-yaml 4.2.0
- Project: https://github.com/nodeca/js-yaml
- License: MIT

### clipper-lib 6.4.2
- License: Boost Software License 1.0
- License text: https://www.boost.org/LICENSE_1_0.txt

## PaddleOCR ONNX model mirror

Candidate100’s verified-mirror path uses the public model repository:

- Repository: https://huggingface.co/LunarOilRig/paddleocr-onnx
- Pinned revision: `7b67be7e7eb3b1ed7f95eaff5c7521498b9515da`
- Models: PP-OCRv5 mobile detection / recognition ONNX archives
- Model card license: Apache License 2.0
- Candidate runtime additionally verifies expected byte length and SHA-256 before using the mirror asset.

The mirror model card states that the files mirror official PaddleOCR archives. Candidate100 does not independently certify upstream byte identity beyond the application’s configured hashes and the audit evidence available on 2026-10-05.

## CSV compatibility reference

The development-only CSV contract documents compatibility work against:

- Project: https://github.com/nitoyon/pokesleep-tool
- License indicated by upstream project: MIT

Candidate100 does not claim that format compatibility alone constitutes copying upstream code. Candidate99 added the two newly supported species by mapping current upstream public Pokémon data into this project's existing master schema; this notice does not imply that the entire master table originated from that project. If copied or adapted source-code expression is identified later, preserve the applicable MIT copyright and permission notice for that material.

## Distribution obligations summary

- Apache-2.0 components: preserve the license and applicable copyright/NOTICE information when redistributing covered material; identify modifications where required by the license.
- MIT components: preserve the copyright and permission notice when redistributing copies or substantial portions.
- Boost Software License 1.0 components: preserve the required copyright/license notice for redistributed source/material as applicable.

For authoritative obligations, use the upstream license text rather than this summary.
