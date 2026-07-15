## 1. Data model — Add `createdAt` to UIMessage

- [x] 1.1 Add `createdAt?: number` (epoch ms) to `UIMessage` interface in `src/ui/shared/types.ts`
- [x] 1.2 Run `npm run typecheck` to verify no type errors from the new optional field

## 2. Reducer — Record timestamps at message creation

- [x] 2.1 In `user_message` case: add `createdAt: Date.now()` to the new user message object
- [x] 2.2 In `updateLastOrCreate` function: add `createdAt: Date.now()` to newly created assistant messages (preserve existing `createdAt` on updated messages)
- [x] 2.3 In `ready` case: propagate `m.createdAt` (if present as a number) from each historical conversation message to the mapped `UIMessage`
- [x] 2.4 Run `npm run typecheck` to verify reducer changes compile

## 3. Web UI — Display real timestamps

- [x] 3.1 In `UserBubble` (`web/src/components/ChatView.tsx` line 369): replace hardcoded `"09:41"` with conditional rendering — show `new Date(message.createdAt).toLocaleTimeString()` when `createdAt` is defined, omit time when absent
- [x] 3.2 In `AssistantMessage` (`web/src/components/ChatView.tsx` line 412): same replacement — replace hardcoded `"09:41"` with `message.createdAt ? new Date(message.createdAt).toLocaleTimeString() : null`
- [x] 3.3 Run `npm run typecheck` to verify ChatView changes compile

## 4. Validation

- [x] 4.1 Run `npm run build` to confirm full build passes
- [ ] 4.2 Manually verify in Web UI that new messages show current time and legacy history messages gracefully omit time
