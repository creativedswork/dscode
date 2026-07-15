## 变更综述

图像管线中压缩缓存一直存在但从未被实际使用——`ImageCache.put()` 将图片压缩为 480px PNG 写入磁盘，但 `ImagePipeline.process()` 始终将原始未压缩图片传给 vision model 和 OCR。这导致大图（如 871KB JPEG）的 base64 编码过大，vision API 调用失败后回退到 OCR，OCR 在高分辨率未压缩数据上产生乱码。本修复让管线正确读取并使用压缩后的缓存图片。

## 变更时间线

- 2025-05-29: session-mm-vision-pipeline — 引入 vision pipeline 和 ImageCache
- 2026-07-15: fix-image-pipeline-uncompressed-images — 修复管线未使用压缩缓存的问题

## 初始设计

**问题**：需要支持多模态 vision 模型处理用户上传的图片。

**方案**：`ImagePipeline.process()` 接收图片 → `ImageCache.put()` 用 sharp 压缩为 480px PNG 并缓存 → 调用 vision model 描述图片 → 失败时回退到 OCR。

## 修复记录

### 修复: 管线未使用压缩后的缓存图片

- **症状**: 拖入 `C罗.jpg`（871KB）到 TUI 产生 `<image_text>` 乱码 OCR 输出（`"4 hm 等 会 > dlr a 一 = FRA 3"`），而更小的 `mubapei.jpeg` 正常走 vision model。管线向 vision API 发送未压缩的 base64（871KB JPEG → ~1.16MB base64），对大图超过 API 限制或超时，vision 调用失败后 OCR 在同样的大图上产生垃圾。
- **根因**: `ImagePipeline.process()` 在 `ImageCache.put()` 压缩并缓存图片后，仍然将原始 `normalizedImages` 传给 `describeImagesViaVisionModel()` 和 `ocrImages()`。压缩缓存只用于 progress callback，从未用于实际的 API 调用。
- **修复**: 在 `ImageCache.put()` 返回后，用 `Promise.all` 并行调用 `ImageCache.get()` 读取压缩图片，传给 vision model 和 OCR。`get()` 返回 `null` 时回退到原始图片。仅修改 `src/drivers/vision/pipeline.ts` 一个文件。

## 最终状态

**问题**: `ImagePipeline.process()` 压缩图片但不使用压缩结果，导致大图 vision API 调用失败，OCR 产生乱码。

**方案**: `ImageCache.put()` 压缩缓存后 → `Promise.all` 并行读取压缩图片 → 传递给 vision model 和 OCR → `get()` 失败时回退原始图片。

**新增能力**:
- `image-pipeline-compressed`: ImagePipeline 将压缩后的缓存图片传递给 vision model 和 OCR，确保大图正常处理
