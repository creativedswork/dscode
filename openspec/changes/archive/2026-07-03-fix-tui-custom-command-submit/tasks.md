## 1. Fix method call

- [x] 1.1 In `src/ui/tui-app.ts` `handleSubmit`, change `this.handleInput(expanded)` to `this.handleSubmit(expanded)` on line ~1117

## 2. Cleanup

- [x] 2.1 Remove duplicate `/` command check block at L1122-L1128 (`if (text.startsWith("/")) { ... }` block that mirrors L1109-L1121)
