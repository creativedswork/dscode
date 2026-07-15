## 1. Modify ImagePipeline.process() to use compressed images

- [x] 1.1 After `ImageCache.put()` returns `cachedRefs`, add a parallel `ImageCache.get()` batch read to obtain compressed `ImageContent[]`
- [x] 1.2 Add fallback: if any `get()` returns null, fall back to original `normalizedImages`
- [x] 1.3 Pass compressed images to `describeImagesViaVisionModel()` instead of `normalizedImages`
- [x] 1.4 Pass compressed images to `ocrImages()` instead of `normalizedImages`

## 2. TypeScript and test

- [x] 2.1 Run `npm run typecheck` to verify no type errors
- [x] 2.2 Run `npm test` to verify no regressions
- [ ] 2.3 Manual test (TUI): drag a large JPEG (>500KB), verify it goes through vision model and not OCR
- [ ] 2.4 Manual test (TUI): drag a small image, verify still works
- [ ] 2.5 Manual test (Web): drag a large JPEG, verify vision model path
- [ ] 2.6 Manual test: verify cached files are used (check `~/.dscode/data/images/` for PNG files)
