## 1. Fix

- [x] 1.1 Add guard in `SessionsPanel` onClick handler: if `isActive && isProcessing`, return early (no-op). Insert before the existing `if (!isDisabled)` guard on line 228 of `web/src/components/Sidebar.tsx`.

## 2. Verify

- [x] 2.1 Verify clicking the active session during processing is a no-op (no session load sent, conversation unchanged)
- [x] 2.2 Verify the active session item appearance is unchanged during processing (no opacity reduction, normal cursor)
- [x] 2.3 Verify clicking an inactive session during processing remains blocked (existing `isDisabled` behavior preserved)
- [x] 2.4 Verify clicking the active session when idle triggers `session load` normally
