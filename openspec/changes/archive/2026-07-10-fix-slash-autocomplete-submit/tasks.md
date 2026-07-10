## 1. Add autocomplete callback to HybridAutocompleteProvider

- [x] 1.1 在 `HybridAutocompleteProvider` 构造函数中添加 `onSlashAutocomplete?: () => void` 参数
- [x] 1.2 在 `applyCompletion` 方法中，判断是否为 slash 命令补全（prefix 以 `/` 开头且不是文件路径），若是则调用 `this.onSlashAutocomplete?.()`

## 2. Wire callback in TuiApp constructor

- [x] 2.1 在 `TuiApp` 中添加 `private lastAutocompleteMs = 0` 字段
- [x] 2.2 构造 `HybridAutocompleteProvider` 时传入 `onSlashAutocomplete: () => { this.lastAutocompleteMs = Date.now(); }`

## 3. Guard in handleSubmit

- [x] 3.1 在 `handleSubmit` 的 slash command 分支中，添加时间戳检测：若 `Date.now() - this.lastAutocompleteMs < 100`，则调用 `this.editor.setText(text + " ")` 并 return

## 4. Verify

- [x] 4.1 `npm run build` 通过
- [ ] 4.2 手动测试 TUI：输入 `/`，用方向键选择命令，按 Enter → 命令填入但不执行
- [ ] 4.3 手动测试 Tab 行为不变
- [ ] 4.4 手动测试：手动输入 `/reset` 并按 Enter（无补全激活）→ 正常执行
