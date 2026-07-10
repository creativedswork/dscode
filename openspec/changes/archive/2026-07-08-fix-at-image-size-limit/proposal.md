## Why

`resolveAtFileRefs` applies a single `maxFileSize` limit (default 50KB) to all `@`-referenced files. For images, this causes files >50KB to be silently skipped with a warning, sending the raw `@file.jpg` text to the model — which then falls back to calling `read_file`. Meanwhile, `/image` and paste paths work fine because they bypass this check and images get compressed later in `ImageCache.put()`.

## What Changes

- Remove the per-file `maxFileSize` gate for image files in `resolveAtFileRefs`. Images are compressed downstream in the vision pipeline, so this guard is unnecessary and harmful.
- Add a separate `maxImageSize` safety limit (default 20MB) to prevent accidentally loading huge images into memory.
- Images no longer count toward `maxTotalSize` — they're processed through the vision pipeline, not injected as text tokens.
- Update `AtFileConfig` to expose the new limit and expand existing config settings.
- Update the `at-file-mention` spec to reflect image handling behavior (the current spec incorrectly requires images to be skipped as "binary").

## Capabilities

### New Capabilities
- `at-image-resolution`: Resolving `@`-referenced image files routes them through the vision pipeline with appropriate size limits, replacing the text reference with an image indicator.

### Modified Capabilities
- `at-file-mention`: The "Binary file" and "File exceeds size limit" scenarios change — image files are no longer skipped as binary, and have their own size limits separate from text files.

## Impact

- `src/utils/at-file-resolver.ts`: Remove image-specific `maxFileSize` check, add `maxImageSize`, stop counting images toward `maxTotalSize`
- `src/core/types.ts`: Add `maxImageSize` to `AtFileConfig`
- `src/core/config.ts`: Add `atFileMaxImageSize` config key, update defaults
- `openspec/specs/at-file-mention/spec.md`: Delta spec modifying image-related scenarios
