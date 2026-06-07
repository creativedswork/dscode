## 1. Code Change

- [x] 1.1 Remove "(no content)" fallback span from ChatView.tsx lines 324-333, replacing the double ternary + separate pulsing-dot check with a single combined conditional per the design doc

## 2. Verification

- [x] 2.1 Run `npm run build:web` and confirm no build errors
- [x] 2.2 Run `npm run typecheck` and confirm no type errors
- [x] 2.3 Manual smoke test: trigger an MCP tool invocation and confirm no "(no content)" appears in the conversation
