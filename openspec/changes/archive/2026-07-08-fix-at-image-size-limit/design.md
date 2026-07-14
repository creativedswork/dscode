## Context

`resolveAtFileRefs` in `src/utils/at-file-resolver.ts` currently applies `DEFAULT_LIMITS.maxFileSize` (50KB) uniformly to all `@`-referenced files. For image files specifically, exceeding this limit causes the image to be **skipped entirely** (not truncated like text files), producing a `truncated` warning and leaving the `@file.jpg` text unresolved in the prompt.

This is the wrong behavior because:
1. Images are processed through the vision/OCR pipeline — they're never injected as raw text.
2. `ImageCache.put()` in the vision pipeline already compresses images (max 480px height via sharp), so raw file size isn't a meaningful constraint.
3. The alternative paths (`/image` command, paste) don't have this restriction and work correctly.

## Goals / Non-Goals

**Goals:**
- `@image.jpg` references resolve images and route them through `promptWithImages` → vision pipeline
- A safety limit exists for images, but at a realistic threshold (e.g., 20MB)
- Images are excluded from `maxTotalSize` calculations (they don't consume text tokens)
- The behavior is configurable via settings

**Non-Goals:**
- Changing how text files are handled (50KB limit, truncation behavior remain)
- Adding image previews or inline display during @-reference resolution
- Modifying the vision pipeline itself

## Decisions

### 1. Separate `maxImageSize` limit, default 20MB

**Why not remove the limit entirely?** A file from disk could theoretically be hundreds of MB. Reading it into memory, base64 encoding it, and passing it to the vision model is wasteful and could OOM. 20MB catches these pathological cases while allowing all realistic images.

**Why 20MB?** Typical screenshots are 200KB–2MB. High-res photos are 5–10MB. 20MB is a generous ceiling that covers RAW camera files while still being a guardrail.

### 2. Images excluded from `maxTotalSize`

`maxTotalSize` limits the total text injected into the prompt. Images don't go through this path — they're compressed and sent to a separate vision model. Counting them in `maxTotalSize` is semantically wrong and creates confusing interactions (one large image could block all text resolution).

### 3. Config key: `atFileMaxImageSize`

Follows the existing naming convention (`atFileMaxFiles`, `atFileMaxFileSize`, `atFileMaxTotalSize`). Default value 20MB. User-configurable in `~/.dscode/settings.json` and `<project>/.dscode/settings.json`.

### 4. Image size check happens in `resolveAtFileRefs`

The check remains in `resolveAtFileRefs` (not deferred to pipeline) because:
- We want to fail fast and show a warning before the vision pipeline starts
- The vision pipeline's compression is async; `resolveAtFileRefs` is sync
- The current code structure makes this the natural place

### 5. Oversized images reject the entire submission

When an image exceeds `maxImageSize`, `resolveAtFileRefs` sets `reject: true` on the result. The callers SHALL check this flag and abort the submission — no prompt reaches the model. This is in contrast to other warnings (not_found, binary_skipped) which are informational and allow the prompt to proceed.

**Why reject rather than skip?** Silently dropping an oversized image and proceeding could lead to confusing behavior — the model receives a different prompt than the user intended. A hard rejection makes the constraint explicit and lets the user decide: resize the image, adjust the limit, or remove the reference.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| Base64 encoding a 20MB image in Node is memory-intensive (~27MB base64 string) | This is the worst case. Typical images are much smaller. The vision pipeline's `ImageCache.put()` compresses them further |
| User sets absurdly high `atFileMaxImageSize` | Config documentation notes the risk. The vision model API itself likely has request size limits that would catch this |
| Image resolution is synchronous in `resolveAtFileRefs` (blocking the event loop) | File read + base64 encode of a typical 2MB image takes <10ms. This was already the case before this change; we're just allowing larger files through |
