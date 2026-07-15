# fix-image-pipeline-uncompressed-images

## Summary

`ImagePipeline.process()` compresses images via `ImageCache.put()` (sharp → 480px PNG) and saves them to disk, but then passes the **original uncompressed** `normalizedImages` to `describeImagesViaVisionModel()`. The compressed cached versions are only used for progress callbacks, never for the actual vision API call.

This causes large images to fail the vision API call → fall through to OCR → OCR on high-resolution uncompressed images produces garbled text.

## Motivation

User reported: dragging `C罗.jpg` (871KB) into TUI produces `<image_text>` with garbled OCR output (`"4 hm 等 会 > dlr a 一 = FRA 3"`), while `mubapei.jpeg` (smaller) works correctly via vision model.

Root cause: The pipeline sends uncompressed base64 (~1.16MB for an 871KB JPEG) to the vision API. For large images, this can exceed API limits or cause timeouts. When the vision call fails, OCR runs on the same large uncompressed data and produces garbage.

## Scope

- **In scope**: Modify `ImagePipeline.process()` to use compressed cached images for vision model and OCR calls
- **Out of scope**: Changes to ImageCache API, changes to vision model configuration, changes to the web frontend

## Resolution

After `ImageCache.put()` compresses and caches all images, the pipeline now reads them back via `ImageCache.get()` and passes the compressed versions to both `describeImagesViaVisionModel()` and `ocrImages()`. If any cache readback returns `null`, the pipeline falls back to the original uncompressed images.

**Verified**: `C罗.jpg` (871KB) now correctly goes through the vision model instead of falling through to garbled OCR output.

## Affected components

- `src/drivers/vision/pipeline.ts` — `ImagePipeline.process()` method (only file changed)
