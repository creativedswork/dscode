## Context

`ImagePipeline.process()` currently compresses images to disk cache but passes uncompressed originals to both the vision model and OCR. This causes large images to fail the vision API call, degrading to garbled OCR output.

The pipeline flow today:

```
normalizedImages (uncompressed base64)
    │
    ├─ ImageCache.put() → sharp 480px PNG → disk (cachedRefs)
    │
    └─ describeImagesViaVisionModel(normalizedImages, ...)  ← uncompressed!
         │  ❌ fails for large images
         ▼
       ocrImages(normalizedImages)  ← uncompressed!
         │  ❌ Tesseract struggles with high-res
         ▼
       garbled output
```

## Goals

- Vision model receives compressed images (≤480px height PNG)
- OCR also receives compressed images for better accuracy
- No change to `ImageCache` public API
- No change to `describeImagesViaVisionModel` or `ocrImages` signatures
- Preserve existing cache deduplication behavior

## Non-Goals

- Not changing the compression parameters (480px, PNG format)
- Not adding new image formats
- Not modifying the web frontend image handling

## Decisions

### Decision 1: Read compressed images back from cache after put

After `ImageCache.put()` compresses and caches all images, read them back via `ImageCache.get()` to get the compressed `ImageContent[]`, then pass those to the vision model and OCR.

```
normalizedImages (uncompressed base64)
    │
    ├─ ImageCache.put() → sharp 480px PNG → disk
    │
    ├─ ImageCache.get(cachedRefs) → compressed ImageContent[]
    │
    ├─ describeImagesViaVisionModel(compressed, ...)  ← compressed!
    │
    └─ ocrImages(compressed)  ← compressed!
```

**Why this approach:**
- Reuses existing `ImageCache.get()` which already reads cached files back as `ImageContent`
- No new compression logic needed
- Cache deduplication still works (subsequent `put` calls are no-ops for same hash)
- The `get` after `put` reads from warm disk cache — negligible overhead

**Alternative considered:**
- **In-memory compression**: Add a new method to `ImageCache` that compresses and returns `ImageContent` without disk I/O. Rejected because it duplicates logic and the disk I/O after write is minimal.
- **Change `ImageCache.put` to also return compressed data**: Would change the public API return type. Rejected for minimal scope.

### Decision 2: Keep original images when sharp is unavailable

When `sharp` is not installed, `ImageCache.put()` stores the original uncompressed data. In this case:
- `ImageCache.get()` returns the same uncompressed data
- The behavior is identical to today (no regression)
- A warning is already logged: `"sharp not available, images will be stored uncompressed"`

### Decision 3: Batch readback

Read all compressed images back in a single `Promise.all`:

```typescript
const compressedImages = await Promise.all(
  cachedRefs.map(ref => ImageCache.get(ref))
);
// Filter out nulls (cache miss should never happen right after put)
const validImages = compressedImages.filter((img): img is ImageContent => img !== null);
```

## Risks

- **[Low] Cache readback could fail if disk is full or permissions change between put and get**: Handle by falling back to original `normalizedImages` if any `get` returns null.
- **[Low] Compressed PNG may be larger than original JPEG for some images**: Sharp's 480px resize + PNG output is consistently smaller than original high-resolution photos. Edge case of very small images (<480px) would produce similar or slightly larger PNG, but still within API limits.
