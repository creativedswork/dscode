## 1. CSS Cleanup — Remove Conflicting Properties

- [x] 1.1 In `web/src/index.css`, strip `font-family`, `font-size`, `line-height`, `color`, `white-space`, `word-break` from `.tool-card-body-inner`. Keep `padding`, `border-top`, `margin-top`, `max-height`, `overflow-y`. Change `max-height` from 320px to 400px.
- [x] 1.2 In `web/src/index.css`, strip `font-family`, `font-size`, `line-height`, `color`, `white-space`, `word-break` from `.mcp-raw-block`. Keep `padding`, `border-top`, `max-height`, `overflow-y`, `background`.

## 2. Markdown Component — Reduce Pre Margin

- [x] 2.1 In `web/src/components/Markdown.tsx`, change the `pre` override's className from `p-3 overflow-x-auto text-xs my-2` to `p-3 overflow-x-auto text-xs my-1` (reduces vertical margin from 8px to 4px).

## 3. ToolCard — MCP Raw Block Uses Markdown

- [x] 3.1 In `web/src/components/ToolCard.tsx`, change the MCP raw block rendering from `{tool.result}` (plain text) to `<Markdown className="text-xs">{tool.result}</Markdown>`.

## 4. Tool Result Formatter — Raise Char Limit

- [x] 4.1 In `src/ui/shared/tool-result-formatter.ts`, change `DEFAULT_MAX_CHARS` from 600 to 2000.

## 5. Build & Verify

- [x] 5.1 Run `npm run typecheck` — must pass with zero errors.
- [x] 5.2 Run `npm run build` — must complete successfully.
- [ ] 5.3 Manually verify in browser: built-in tool JSON results render as pretty-printed code blocks with horizontal scroll; MCP text results render as Markdown; no large blank space inside tool cards.
