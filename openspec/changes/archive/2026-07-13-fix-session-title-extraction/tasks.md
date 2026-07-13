## 1. Fix command regex and add noise filter

- [x] 1.1 Fix `SLASH_COMMAND_RE`: add `:` to character class (`/^\/[a-zA-Z][a-zA-Z0-9_:-]*\s*/`)
- [x] 1.2 Add `NOISE_PATTERNS` array with English acknowledgment, Chinese acknowledgment, and punctuation-only regexes
- [x] 1.3 Add `isNoiseMessage(text: string): boolean` helper that checks against all noise patterns
- [x] 1.4 Add `MIN_TITLE_LENGTH = 10` constant

## 2. Rewrite `extractSessionTitle` to scan backward

- [x] 2.1 Change `extractSessionTitle` from forward scan to reverse scan (for loop from `messages.length - 1` down to 0)
- [x] 2.2 In reverse pass: skip command messages, skip noise messages, skip messages < MIN_TITLE_LENGTH after stripping
- [x] 2.3 Return first qualifying message found in reverse scan (truncated to 60 chars)
- [x] 2.4 Fallback (no qualifying messages): try last command's argument, then first message text, then "New session"

## 3. Simplify `isTitleBetter`

- [x] 3.1 Remove command-remnant detection from `isTitleBetter` (no longer needed — noise filter handles it)
- [x] 3.2 Keep: replace if current is "New session" or empty
- [x] 3.3 Keep: don't replace a substantive title with a shorter/less informative one

## 4. Update and verify

- [x] 4.1 Update existing unit tests for `extractSessionTitle` to reflect new last-message-wins behavior
- [x] 4.2 Add test cases: colon command stripping, noise message skipping, minimum length gate
- [x] 4.3 Run `npm run typecheck`
- [x] 4.4 Run `npm test`
