## 1. Frontend — base64 encoding (MessageInput.tsx)

- [x] 1.1 Replace `reader.readAsText(file)` with `reader.readAsDataURL(file)` + base64 extraction in `handleDrop`
- [x] 1.2 After `reader.onload`, strip `data:<mime>;base64,` prefix to get raw base64: `dataUrl.substring(dataUrl.indexOf(',') + 1)`
- [x] 1.3 The Promise type `Promise<string>` unchanged — base64 is still a string
- [x] 1.4 Run `npm run typecheck` and verify MessageInput compiles

## 2. Backend — base64 decoding (web-backend.ts)

- [x] 2.1 Change `writeFileSync(tempPath, uf.content, "utf-8")` to `writeFileSync(tempPath, Buffer.from(uf.content, "base64"))` (line 528)
- [x] 2.2 Run `npm run typecheck` and verify web-backend compiles

## 3. Validation

- [ ] 3.1 Manual test: drag a PDF (<10MB) into Web UI, verify the file in `.dscode/uploads/` is byte-identical to the original
- [ ] 3.2 Manual test: drag a text file (.txt, .md), verify content is byte-identical
- [ ] 3.3 Manual test: drag an image file, verify it still goes through the image compression pipeline (not the base64 path)
- [ ] 3.4 Manual test: drag a binary file >10MB, verify toast appears and file not uploaded
- [x] 3.5 Run `npm run build && npm test` and verify no regressions
