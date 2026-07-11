## 1. Types

- [x] 1.1 Add `TimestampEntry` interface to `web/src/animation/types.ts`

## 2. Timestamp Collection

- [x] 2.2 Add `timestamps` and `dissolvedTimestampEls` fields to `AnimationState` in TransitionCanvas
- [x] 2.3 Implement `buildTimestampList()` — query `.meta` elements, filter visibility, cache rects
- [x] 2.4 Call `buildTimestampList()` during initialization, after `buildRowList()`

## 3. Dissolution Effect

- [x] 3.1 Implement `dissolveTimestamp()` — spawn 2–3 particles per character, split colors at "·", fade DOM element
- [x] 3.2 Implement `checkTimestampProximity()` — iterate timestamps, check 60px threshold, trigger dissolution during hop/dwell
- [x] 3.3 Call `checkTimestampProximity()` inside `updateCascade()` after the hop-state switch block

## 4. Thinking Block Strike

- [x] 4.1 Add `data-collider="thinking-block"` to the `.thinking` div in `ThinkingBlock` component (ChatView.tsx)
- [x] 4.2 Implement `destroyThinkingBlock()` in TransitionCanvas — opacity fade 300ms + 15–25 gentle rising particles (1–2px, accent + muted colors, vy rand(-3,-1), vx rand(-1.5,1.5), life rand(600,1000)ms)
- [x] 4.3 Add `"thinking-block"` case to `destroyByType()` switch

## 5. Validation

- [x] 5.1 Run `npm run typecheck` to verify no TypeScript errors
- [ ] 5.2 Manual smoke test: start web UI, send messages with assistant responses, switch to dashboard, verify timestamps dissolve and thinking blocks are struck with quiet dissolution
