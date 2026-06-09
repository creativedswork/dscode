## 1. Locate and read system prompt source

- [x] 1.1 定位系统提示词源文件中 `## Rules` 子章节的精确位置和当前内容

## 2. Update Rules content

- [x] 2.1 将 "execute them one by one" 替换为并行化规则：独立调用批量发出，有依赖的串行
- [x] 2.2 新增文件工具偏好规则：prefer write_file/edit/read_file/grep，bash 禁用于 sed/cat/awk
- [x] 2.3 新增 Skill 激活规则：任务涉及 Skill 时先 `skill` 加载再执行

## 3. Update spec

- [x] 3.1 将 system-prompt-structure 的 "Tool Use section" requirement 更新为包含新规则内容的版本（应用 specs/ 下的 delta）
- [x] 3.2 验证 spec 中所有 scenario 的 WHEN/THEN 格式正确（4 个井号 `####`）

## 4. Verification

- [x] 4.1 确认 Rules 共 7 条规则、顺序正确
- [x] 4.2 确认非 Rules 部分未被修改
