## Visual Direction

无需 UI 视觉变化——此变更仅影响 Agent 收到的 prompt 文本格式。TUI prompt 框的 `[file:xxx]` 标记保持不变。

## Before / After Comparison

### 拖入 1 个图片 + 2 个非图片文件

**Before (当前 — 浪费 context window):**

```
[file:photo.png] [file:config.json] [file:types.ts]

用户说: 帮我看看这些文件

`/Users/xxx/Desktop/photo.png`:
```png
iVBORw0KGgo... (base64 数据, 可能数 KB)
```

`/Users/xxx/Desktop/config.json`:
```json
{
  "settings": { ... 500 lines of JSON ... }
}
```

`/Users/xxx/Desktop/types.ts`:
```typescript
export interface User { ... 200 lines of types ... }
```
```

→ Agent 拿到大量不需要预读的文件内容
→ 如果文件很大（如几百行的 JSON/TS），直接占满 context window

**After (修复后 — 只有路径引用):**

```
[file:photo.png] [file:config.json] [file:types.ts]

用户说: 帮我看看这些文件

📁 Attached files:
- `/Users/xxx/Desktop/config.json`
- `/Users/xxx/Desktop/types.ts`

<image_description>
一张截图，显示了一个配置面板...
</image_description>
```

→ 图片经过 ImagePipeline，Agent 拿到文字描述 ✅
→ 非图片只有清晰路径引用，Agent 可以 `read_file` 按需读取 ✅
→ Context window 节省大量空间 ✅

## Interaction Flow

```
拖入文件
    │
    ├── 图片 (.png/.jpg/.webp/.gif/.bmp)
    │      │
    │      ├── TUI prompt: [file:photo.png]  (不变)
    │      ├── Attachment bar: 📷 1 image  (不变)
    │      └── Prompt: resolveFileRefs → ImageContent[] → ImagePipeline
    │             → <image_description> 文本描述
    │
    └── 非图片 (其他所有扩展名)
           │
           ├── TUI prompt: [file:config.json]  (不变)
           ├── Attachment bar: 📎 config.json  (不变)
           └── Prompt: 纯路径引用
                  → `📁 /abs/path/config.json`
```

## Design References

- `file-tracker` spec：已定义 FileTracker 的绝对路径存储和 display path 逻辑
- `tui-attachment-bar-render` spec：已定义附件栏渲染行为
- `image-pipeline` spec：已定义 ImagePipeline 处理流程
- 拖放输入的粘贴检测在 `handlePasteImage` 中，无需修改

## Accessibility Notes

无 UI 交互变更。TUI 编辑框中的 `[file:xxx]` 标记保持现有格式（basename only），不影响可读性。
