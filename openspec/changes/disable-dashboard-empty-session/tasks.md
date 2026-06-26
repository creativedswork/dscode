## Tasks

- [x] **Task 1**: Add `disabled` prop to `ViewModeSwitcher` — apply `opacity: 0.4`, `pointer-events: none`, `cursor: not-allowed` to `<select>` and icon when true
- [x] **Task 2**: Pass `disabled={currentSessionId === null}` from `App.tsx` to `ViewModeSwitcher`
- [x] **Task 3**: Add guard clause in `handleViewModeChange`: early-return if switching to dashboard with no session
- [x] **Task 4**: Verify — open app with no session, confirm dashboard option is disabled; create a session, confirm it becomes enabled
