## Context

当前 `handleSubmit` 中 `hasFiles` 分支对所有拖放文件（图片和非图片）统一调用 `resolveFileRefs`，该函数读取文件内容并注入 prompt。非图片文件的预读浪费 context window——Agent 只需知道绝对路径，可自行按需 `read_file`。

图片文件仍需走 `resolveFileRefs` 提取 base64 后进入 `ImagePipeline`。

## Goals / Non-Goals

**Goals:**
- 非图片拖放文件：Agent prompt 中只注入绝对路径引用，不预读内容
- 图片拖放文件：保持现有行为不变（进入 ImagePipeline）
- TUI prompt 框的 `[file:xxx]` 标记和 attachment bar 保持不变
- Web UI 对应路径同步修改

**Non-Goals:**
- 不改变 FileTracker 的存储逻辑
- 不改变 ImagePipeline 的处理流程
- 不改变 paste/drop 事件的检测逻辑

## Decisions

### Decision 1: 在 handleSubmit 中按文件类型分流

`handleSubmit` 的 `hasFiles` 分支当前逻辑：

```
fileRefs = tracker.drain()
for all fileRefs:
    resolveFileRefs(projectPath, fileRefs)  → 读内容 + 提取图片
    text += refsResolved.text
    images += refsResolved.images
```

改为：

```
fileRefs = tracker.drain()
imageRefs = fileRefs.filter(isImagePath)
nonImageRefs = fileRefs.filter(f => !isImagePath(f))

// 图片：走现有 resolveFileRefs
if imageRefs.length > 0:
    resolveFileRefs(projectPath, imageRefs)  → 只有图片
    images += refsResolved.images

// 非图片：只注入路径引用
if nonImageRefs.length > 0:
    pathLines = nonImageRefs.map(f => `- \`${f}\``).join('\n')
    text += '\n\n📁 Attached files:\n' + pathLines
```

**替代方案考虑**：
- 方案 B：修改 `resolveFileRefs` 内部逻辑，加 `skipContentRead` 参数。→ 污染通用函数，不选。
- 方案 C：新建 `resolveFilePaths` 只处理路径。→ 过度设计，改动量相似但多一个函数。

**选择方案 A 的原因**：改动集中在 `handleSubmit` 一处，逻辑清晰，不影响现有 `resolveFileRefs` 的语义。

### Decision 2: 图片检测使用现有 `isImagePath`

复用 `at-file-resolver.ts` 中已导出的 `isImagePath`（或内部使用的同逻辑）。当前 `isImagePath` 匹配 `.png/.jpg/.jpeg/.gif/.webp/.bmp`。

如果 `isImagePath` 未导出，则在 `tui-app.ts` 中内联一个简单的扩展名检测（不需要引入整个 at-file-resolver 的复杂度）。

### Decision 3: 路径引用格式

格式选择：`📁 Attached files:\n- \`/abs/path/file.ts\``

- 使用 emoji `📁` 作为视觉标记，与现有系统风格一致
- 反引号包裹路径，符合 markdown 代码引用风格
- 每条路径一行，方便 Agent 提取

**替代方案**：用 `[Attached: /abs/path]` 格式 → 与 `[file:xxx]` 标记语义冲突，不选。

### Decision 4: Web 端同步修改

`web-backend.ts` 中对应的 `hasFiles` 分支（约 line 505-530）与 TUI 端逻辑一致，需要同步修改。~~**注意**：此决策基于「Web 端也能获取绝对路径」的错误假设，已被 Decision 5 取代。Web 端实际需要不同的处理方式。~~

### Decision 5: Web 端拖放改用文件上传 + 临时路径

**问题**：Decision 4 假设 Web 端和 TUI 端可以复用同一套「注入绝对路径」逻辑，但这对 Web 端不成立。

- 浏览器安全沙箱禁止网页获取拖放文件的绝对路径（`File.path` 在非 Electron 环境下恒为 `undefined`）
- Web 端的 `fileRefs` 实际传入的是裸文件名（`file.name` fallback），而非绝对路径
- 导致 `resolveFileRefs` 无法在服务端定位文件（`not_found`），图片内容无法提取，非图片路径引用也无效

**决策**：Web 端拖放采用与 paste 相似的机制——在浏览器端用 `FileReader` 读取文件内容后传到服务端。

```
Web UI drop 流程：

  浏览器端                         服务端
  ────────                        ──────
  FileReader.readAsDataURL()      
  → 图片：base64 → images[]       和 paste 行为一致，直接进入 ImagePipeline
  
  FileReader.readAsText()         
  → 非图片：文本内容 → WebSocket   
                                  写入临时文件：
                                  .dscode/uploads/<session>/<timestamp>-<filename>
                                  
                                  注入 prompt：
                                  📁 Attached files:
                                  - `/project/.dscode/uploads/.../config.json`
                                  
                                  Agent 可通过 read_file 读取 ✅
```

**与 TUI 端的差异**：
| 方面 | TUI | Web UI |
|------|-----|--------|
| 路径来源 | OS 原生，绝对路径 | 服务端生成的临时路径 |
| 图片 | resolveFileRefs 从磁盘读 | FileReader 浏览器读 |
| 非图片 | 只注入原始路径，不读内容 | 上传内容到临时文件，注入临时路径 |
| Agent 行为 | read_file 读原始文件 | read_file 读临时副本 |

**临时文件管理**：
- 路径：`.dscode/uploads/<session-id>/<timestamp>-<original-name>`
- 跳过已存在的临时文件（timestamp 保证唯一性）
- 会话结束时清理临时目录（或在 compaction 时清理）

**大小限制**：沿用 `atFile` 配置中的 `maxFileSize` / `maxTotalSize`，在浏览器端做预检查。

## Risks / Trade-offs

- **[风险] `isImagePath` 扩展名白名单可能漏掉新格式** → 低风险。白名单已覆盖主流图片格式。新增格式可后续扩展。
- **[风险] Agent 拿到多个绝对路径后可能一次 `read_file` 多个大文件** → 这是 Agent 的自主决策，与现有 `@path` 引用行为一致，非新引入风险。
- **[Trade-off] 非图片文件的文件大小检查被跳过** → 当前 `resolveFileRefs` 有 maxFileSize/maxTotalSize 限制。跳过内容读取后，这些限制不再适用——但 Agent 自己调用 `read_file` 时仍受工具层限制保护。

- **[Trade-off] 外部文件必须复制到 temp 目录，占用磁盘空间** → 浏览器沙箱禁止获取绝对路径，无法用 symlink。但项目文件走 @path 匹配不占空间，外部文件 session 结束时清理，实际影响极小。

### Decision 6: 拖入文件优先尝试项目内 @path 匹配

**问题**：当前 handleDrop 对所有非图片文件一律读取 content → temp file。但实际上很多拖入的文件就在项目目录里，如果能匹配到项目路径，直接注入 `@path` 引用即可——零传输、零磁盘开销、零大小限制，和 TUI 行为一致。

**决策**：在 handleDrop 中增加一层"项目文件匹配"路由：

```
handleDrop(files):
  for each file:
    if isImage(file.type):
      → fileToImageAttachment → compress → images state  (不变)
    else:
      → 用 file.name 搜索项目文件列表 (复用 file_list 命令)
      
      匹配 1 个 → 注入 @path (零传输,零磁盘)
      匹配 N 个 → 弹 picker (复用 showFileMenu) → 用户选 → 注入 @path
      匹配 0 个 → 外部文件 → 现有 upload-to-temp 流程
                     → 大小检查 (config 驱动,默认 10MB)
                     → toast 提示超限
```

**与现有 spec 的关系**：这是对 `web-upload-temp-file` spec 的扩展——upload-to-temp 变成了 fallback 路径，而非唯一路径。

**UI 复用**：文件选择 picker 复用 `MessageInput` 中已有的 `showFileMenu` 组件，不需要新建 UI。

### Decision 7: 文件大小限制从 config 驱动

**问题**：当前硬编码 `MAX_FILE_SIZE = 50KB`（太保守），且对图片和非图片不对称（图片无限制）。

**决策**：
- 服务端通过 `config` / `ready` 事件下发 `maxFileSize` 和 `maxTotalSize`
- 默认值：`maxFileSize = 10MB`，`maxTotalSize = 50MB`（只对走 upload-to-temp 的外部文件生效）
- 图片不设大小限制（走 compressImage 已有压缩保护）
- 项目 @path 文件不设大小限制（零传输）
- 超限文件被跳过时**必须显示 toast 警告**，不能静默丢弃

### Decision 8: Settings 面板增加缓存管理

**决策**：
- Settings 面板底部增加 "Upload Cache" 区域
- 显示当前缓存状态：文件数 + 总大小（服务端启动时扫描，`upload_stats` 事件推送）
- 提供 "Clear Upload Cache" 按钮
- 点击发送 `{ type: "clear_uploads" }` → 服务端删除 `.dscode/uploads/` 全部内容 → 返回统计 → toast 反馈
