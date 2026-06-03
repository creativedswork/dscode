## 1. Implementation

- [x] 1.1 Add `useRef<boolean>` for IME composition state tracking in `MessageInput`
- [x] 1.2 Add `onCompositionStart` and `onCompositionEnd` handlers to the `textarea` element
- [x] 1.3 Modify `handleKeyDown` Enter branch to skip submission when composing

## 2. Verification

- [x] 2.1 Verify `npm run typecheck` passes
- [x] 2.2 Manual test: Chinese pinyin IME — type English letters and press Enter to confirm → message should NOT be sent, text should appear in input
- [x] 2.3 Manual test: Normal Enter (no IME) → message should be sent as before
- [x] 2.4 Manual test: Shift+Enter → newline inserted, no submission
