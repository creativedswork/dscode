## 1. Dependencies

- [x] 1.1 Install `jpeg-js` and `pngjs` as production dependencies
- [x] 1.2 Run `npm install` and verify no native addon compilation errors
- [x] 1.3 Add type declarations if needed (jpeg-js and pngjs ship their own `.d.ts`)

## 2. Conversion Utility

- [x] 2.1 Create `src/utils/image-convert.ts` with `convertJpegToPng(jpegBase64: string): string | null`
- [x] 2.2 Implement: `Buffer.from(base64) → jpeg.decode() → PNG.sync.write() → Buffer.toString('base64')`
- [x] 2.3 Wrap in try/catch — return null on any decode/encode failure
- [x] 2.4 Export as named export

## 3. Conversation View Integration

- [x] 3.1 In `src/ui/conversation.ts`, import `convertJpegToPng` from `../utils/image-convert.js`
- [x] 3.2 In `addInlineImage()`, replace the `if (isJpeg) skip` guard with: if JPEG, call `convertJpegToPng`; if successful, use PNG data and `image/png` mime type for both file save and `Image` component
- [x] 3.3 Pass through `displayData` and `displayMimeType` to the file write and `Image` constructor (instead of original `base64Data`/`mimeType`)
- [x] 3.4 Remove the `const isJpeg` check that gates the `Image` constructor — all formats now attempt rendering

## 4. Verification

- [ ] 4.1 Manual test: `@photo.jpg` + Enter — verify image renders inline in Kitty/Ghostty/WezTerm
- [ ] 4.2 Manual test: paste JPEG from clipboard — verify draft preview renders inline
- [ ] 4.3 Manual test: `@photo.png` — verify no regression (PNG still renders as before)
- [ ] 4.4 Manual test: corrupt/invalid JPEG — verify graceful fallback to file path only
- [x] 4.5 Run typecheck: `npm run typecheck` — verify zero type errors
- [x] 4.6 Run existing tests: `npm test` — verify no regressions
