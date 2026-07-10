## Context

The Kitty graphics protocol — used by Kitty, Ghostty, and WezTerm terminals for inline image rendering — supports three transmission formats: raw RGB (`f=24`), raw RGBA (`f=32`), and PNG (`f=100`). It does NOT support JPEG or WebP passthrough.

pi-tui's `encodeKitty()` hardcodes `f=100` (PNG) when building the escape sequence:

```js
// pi-tui terminal-image.js
const params = ["a=T", "f=100", "q=2"];  // ← always PNG
```

When non-PNG data is sent with `f=100`, the terminal attempts to decode it as PNG and fails silently — no image, no error, just blank space. This affects both JPEG (magic `\xFF\xD8`) and WebP (magic `RIFF....WEBP`). Compounding the problem, files with misleading extensions (e.g., a WebP image saved as `.png`) bypass extension-based guards entirely, receiving `image/png` mimeType while containing WebP data.

dscode currently works around this by skipping JPEGs in `ConversationView.addInlineImage()`:

```ts
// conversation.ts line 374-376
const isJpeg = mimeType === "image/jpeg" || mimeType === "image/jpg";
if (!isJpeg) {
  try { const img = new Image(...); } catch { }
}
```

JPEGs are still saved to `~/.dscode/image-cache/` and sent to the LLM — only the terminal inline render is skipped. Users see a file path but not the actual image.

## Goals / Non-Goals

**Goals:**
- JPEG and WebP images render inline in the terminal identically to PNG/GIF/BMP
- Actual image format is detected from magic bytes, not file extension, preventing silent failures from misnamed files
- Zero async refactoring — conversion is synchronous to avoid ripple
- Graceful fallback if conversion fails (corrupt files, OOM)
- Minimal dependency footprint — pure JS, no native addons beyond sharp (already optional)

**Non-Goals:**
- Converting other unsupported formats (HEIC, AVIF, TIFF) — those remain file-path-only
- Optimizing image quality/size during conversion — decode+encode passthrough only
- Support for terminals without any graphics protocol — already handled by pi-tui's `imageFallback()`

## Decisions

### Decision 1: Convert at `addInlineImage` layer (not `resolveAtFileRefs`)

**Chosen: `ConversationView.addInlineImage()`**

| Option | Coverage | Ripple | Complexity |
|--------|----------|--------|------------|
| `resolveAtFileRefs` only | @file only | Medium (async) | Low |
| `addInlineImage` (chosen) | @file + paste | **Zero** (sync) | **Lowest** |
| Both layers | Both | High | Redundant |

`addInlineImage` is the single chokepoint where ALL images enter the conversation view — `@file` references, clipboard paste, tool results, and session replay. Fixing it here covers every image source. The JPEG skip already lives here, making it the natural upgrade point.

### Decision 2: Pure JS sync conversion (`jpeg-js` + `pngjs`)

### Decision 4: Detect format from magic bytes, not file extension

**Chosen: Read first 12 bytes of image data to determine actual format.**

pi-tui's `getImageDimensions()` already implements this for PNG/JPEG/GIF/WebP. We replicate the same logic in our conversion utility to correctly identify the source format regardless of file extension.

| Magic bytes | Format | Conversion needed? |
|-------------|--------|--------------------|
| `\x89PNG` | PNG | No (pass through) |
| `\xFF\xD8` | JPEG | Yes → PNG |
| `RIFF....WEBP` | WebP | Yes → PNG |
| `GIF8` | GIF | No (pass through) |
| `BM` | BMP | No (pass through) |

This eliminates the entire class of "wrong extension" bugs. A file named `photo.png` containing WebP data will be correctly identified and converted.

### Decision 5: Convert WebP by decoding to raw pixels via sharp fallback

jpeg-js only handles JPEG. For WebP, we have two options:
- **sharp** (already in optionalDeps): `sharp(buf).png().toBuffer()` — async
- **Pure JS WebP decoder**: would add another dependency

**Decision**: Use sharp for WebP→PNG conversion when available. Since sharp is async, WebP conversion runs as a fire-and-forget post-render step: the image first shows as file-path-only, then swaps to inline PNG once sharp completes. When sharp is unavailable, WebP falls back to file-path-only (graceful degradation). JPEG conversion remains sync via jpeg-js.

**Chosen: `jpeg-js` 0.4.x + `pngjs` 7.x**

| Library | Type | Native deps | Size | Maturity |
|---------|------|-------------|------|----------|
| sharp (available) | Native | libvips (~30MB) | — | Gold standard |
| jpeg-js | Pure JS | None | ~80KB | 8M+ weekly downloads |
| canvas | Native | Cairo+Pango | ~50MB | Widely used |
| jimp | Pure JS | None | ~5MB | Full toolkit (overkill) |
| **jpeg-js + pngjs** | **Pure JS** | **None** | **~130KB combined** | **Both 5M+ weekly downloads** |

Sharp is already in `optionalDependencies` but is inherently async (libuv thread pool). Using it would require making `addInlineImage` async, rippling through ~8 call sites. jpeg-js + pngjs provide synchronous decode+encode with zero architectural change.

**Conversion flow:**
```
JPEG base64 → Buffer → jpeg.decode() → {width, height, data: RGBA Buffer}
                                          ↓
PNG base64  ← Buffer ← PNG.sync.write() ← {width, height, data}
```

### Decision 3: Existing try/catch handles fallback

No new error handling needed. The current `try { new Image(...) } catch { }` around the Image constructor already handles all failure modes — corrupt JPEG, OOM during decode, PNG encode failure. The file path text (`[image: /path/to/file.jpg]`) is always rendered regardless.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **WebP with `.png` extension** | `resolveAtFileRefs` maps `.png` → `image/png` regardless of actual content. WebP data labeled as PNG reaches the terminal, which silently fails. Fixed by format detection from magic bytes. |
| **Color profile loss** | jpeg-js decodes to sRGB by default. Embedded ICC profiles are discarded. Acceptable for terminal preview. |
| **Exif orientation** | jpeg-js does not auto-rotate based on EXIF orientation. Terminal shows stored orientation. Acceptable. |
| **New dependencies** | Both MIT-licensed, pure JS, zero transitive deps, ~130KB combined. |

## Open Questions

- **Should we prefer sharp when available?** Sharp is already in `optionalDependencies`. If it's installed, we could use it asynchronously for higher quality (color profile support, EXIF rotation) and fall back to pure JS when unavailable. This is an optimization, not part of the initial implementation.
