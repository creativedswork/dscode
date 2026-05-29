## 1. 依赖安装

- [x] 1.1 安装 `sharp`：`npm install sharp`，加到 `package.json`
- [x] 1.2 安装 `@types/sharp`：`npm install -D @types/sharp`

## 2. 类型定义扩展

- [x] 2.1 在 `src/core/types.ts` 中新增 `ImageRef` 接口
- [x] 2.2 新增 `VisionMessage` 接口
- [x] 2.3 在 `SessionMetadata` 中新增 `hasImages: boolean` 和 `imageCount: number`
- [x] 2.4 `SerializedSession` 的 `version` 字段类型扩展为 `1 | 2`
- [x] 2.5 给 `ConversationMessage` 和 `UIMessage` 的 `images` 增加 `ImageRef` 支持

## 3. 图片缓存层 — `src/utils/image-cache.ts`

- [x] 3.1 创建 `ImageCache` 类
  - `put(image: ImageContent): Promise<ImageRef>` — 压缩至 height=480，写入缓存，返回引用
  - `get(ref: ImageRef): Promise<ImageContent | null>` — 读取缓存，返回 base64；不存在返回 null
  - `cacheDir()` 返回 `~/.dscode/data/images/` 路径，确保目录存在
  - 使用 `sharp` 进行 resize（height=480，width 等比缩放），输出 JPEG quality=85
  - 如果原图 height ≤ 480，不做 upscale，仅 re-encode as JPEG
- [x] 3.2 `put()` sha256 前 16 位做文件名，检查已存在去重
- [x] 3.3 put 失败时 console.error 并 fallback 存储原始
- [x] 3.4 get() 返回 `ImageContent` 格式兼容

## 4. Session 管理改造

- [x] 4.1 validateSession 增加 version:2 验证
- [x] 4.2 saveSession 中 serializedMessages 拷贝 + ImageRef 转换
  - 遍历 `agent.state.messages`，对用户消息中 `images`（如果有）调用 `ImageCache.put()` 转为 `ImageRef[]`
  - 将 `ImageRef[]` 存入消息结构中，内联 base64 不再保存
  - 设置 `metadata.hasImages` 和 `metadata.imageCount`
  - 如果有 `visionMessages`，一并序列化到 session 文件
- [x] 4.3 version 设为 2（有图片/vision）或 1
- [x] 4.4 loadSession 中 restoreImagesFromCache 恢复图片
- [x] 4.5 extractFirstUserMessage 不受影响

## 5. Vision 模型调用日志

- [x] 5.1 visionMessages 数组
- [x] 5.2 turnIndex 记录
- [x] 5.3 vision 成功后构建 VisionMessage
- [x] 5.4 路径 B 先 ImageCache.put 再 vision 调用
- [x] 5.5 visionMessages 随 session 保存
- [x] 5.6 加载 session 时恢复 visionMessages

## 6. Harness 集成

- [x] 6.1 promptWithImages 主流程改造
  ```
  user images → ImageCache.put() → ImageRef[]
  ├─ 主模型支持 → promptAndSave(text, ImageRef[])  // 消息中嵌入引用
  ├─ Vision 模型 → describeImagesViaVisionModel(refs) → VisionMessage → promptAndSave(text with description)
  └─ OCR 回退  → promptAndSave(text with ocr)
  ```
- [x] 6.2 路径 A 先缓存再发主模型
- [x] 6.3 路径 B 成功后存入 VisionMessage
- [x] 6.4 promptAndSave 使用缓存后的图片

## 7. Web 后端适配

- [x] 7.1 buildConversationHistory 保持现有逻辑（agent 消息未被 mutate）
- [x] 7.2 handleMessage 中 images 传给 promptWithImages（已缓存）
- [x] 7.3 buildConfigData 无影响
- [x] 7.4 ConversationMessage images 兼容 ImageRef

## 8. Package.json 和构建

- [x] 8.1 sharp 配置为 optionalDependencies
- [x] 8.2 动态 try/catch import sharp
- [x] 8.3 typecheck 通过
- [x] 8.4 npm start 验证启动正常
