# eval-budget-guard Specification

## Purpose

Prompt 构建层硬限制。在所有 eval LLM 调用的 prompt builder 中植入 Budget Guard，确保每次调用的 prompt ≤60K chars（~15K tokens）。超预算时按信号优先级逐级裁剪内容。

## ADDED Requirements

### Requirement: Budget enforcement on all eval LLM prompts

The system SHALL enforce a maximum prompt size of 60,000 characters for every LLM call in the eval pipeline.

The budget SHALL be enforced at prompt construction time, before the LLM call is made.

The constant `MAX_PROMPT_CHARS = 60000` SHALL be defined in the budget-guard module.

#### Scenario: Prompt under budget passes through

- **WHEN** a Scan prompt is built with size 8,500 chars
- **THEN** the prompt SHALL be returned unchanged
- **AND** no trimming SHALL occur

#### Scenario: Prompt over budget triggers trimming

- **WHEN** a Zoom prompt is built with size 72,000 chars
- **THEN** the budget guard SHALL trim content to ≤60,000 chars
- **AND** the trimmed prompt SHALL still be syntactically valid

### Requirement: Tiered trimming strategy

The system SHALL trim prompt content in priority tiers when the budget is exceeded:

1. **Tier 1 — Cold Zone summaries**: Compress statistical summaries (e.g., "read_file×12, grep×8" instead of per-agent breakdown)
2. **Tier 2 — Low-suspicion Hot Zones**: Downgrade the lowest suspicionScore Hot Zone(s) from per-step detail to statistical summary
3. **Tier 3 — Per-step detail truncation**: Within remaining Hot Zones, truncate `thought` to 50 chars and `result` to 100 chars per step
4. **Tier 4 — Minimum viable context**: Ensure at least the first 5 and last 5 steps of the highest-suspicion Hot Zone remain; if still over budget, truncate the middle steps

At each tier, the system SHALL re-check if the prompt is now within budget before proceeding to the next tier.

#### Scenario: Tier 1 trimming suffices

- **WHEN** a prompt is 62,000 chars (2,000 over budget)
- **THEN** Cold Zone summaries SHALL be compressed
- **AND** no Hot Zone detail SHALL be affected
- **AND** the resulting prompt SHALL be ≤60,000 chars

#### Scenario: Tier 3 truncation applied

- **WHEN** after Tier 1 and Tier 2 trimming, prompt is still 68,000 chars
- **THEN** `thought` fields SHALL be truncated to 50 chars
- **AND** `result` fields SHALL be truncated to 100 chars
- **AND** truncation markers ("...") SHALL be appended

#### Scenario: Tier 4 minimum context preserved

- **WHEN** after Tier 3, prompt is still over budget
- **THEN** at minimum the first 5 and last 5 steps of the highest-suspicion Hot Zone SHALL remain
- **AND** middle steps SHALL be replaced with a `"... (N steps omitted) ..."` marker
- **AND** the marker SHALL indicate how many steps were omitted

### Requirement: Budget guard logging

The system SHALL log when budget trimming is applied.

The log SHALL include:
- Which tier was reached
- Original prompt size and trimmed prompt size
- Which content was trimmed (e.g., "Zone Z3 downgraded to summary", "42 step results truncated")

Log level SHALL be "warn" for Tier 2+, "info" for Tier 1 only.

#### Scenario: Budget trimming is logged

- **WHEN** a Zoom prompt is trimmed from 72,000 to 58,000 chars
- **THEN** a warning log SHALL be emitted
- **AND** the log SHALL include the original and trimmed sizes

### Requirement: LLM maxTokens output limit

The system SHALL pass a `maxTokens` parameter to every eval LLM call to prevent output truncation.

Token limits per step:
- Pass 1 Scan: `maxTokens = 4096`
- Pass 2 Zoom: `maxTokens = 8192`
- Pass 3 Synthesize: `maxTokens = 6144`
- Step 7 Rules: `maxTokens = 8192`
- Existing fast-path steps 1-6: `maxTokens = 8192`

The `maxTokens` SHALL be passed via the `StreamOptions` parameter of `completeSimple()`.

#### Scenario: maxTokens prevents LLM output truncation

- **WHEN** a Zoom LLM call is made with `maxTokens: 8192`
- **THEN** the LLM provider SHALL be instructed to limit output to 8192 tokens
- **AND** the LLM SHALL NOT produce output beyond this limit

### Requirement: Safe JSON parse wrapper

The system SHALL wrap all `JSON.parse()` calls in the eval pipeline with a `safeJsonParse()` function that catches exceptions and returns null on failure.

The `safeJsonParse()` function SHALL:
1. Accept: `json: string`, `stepName: string`, `validator: (unknown) => ValidationResult<T>`
2. Call `JSON.parse(json)` inside try/catch
3. On parse failure: log warning with stepName and error message, return null
4. On parse success: run validator, return validated value or null
5. Never throw an exception

All existing JSON.parse calls in `src/eval/llm.ts` and `src/eval/rules/extraction.ts` SHALL use this wrapper.

#### Scenario: Valid JSON parses correctly

- **WHEN** `safeJsonParse('{"valid": true}', "test", validator)` is called
- **THEN** it SHALL return the validated object
- **AND** no exception SHALL be thrown

#### Scenario: Unterminated string returns null

- **WHEN** `safeJsonParse('{"text": "unterminated', "Step3", validator)` is called with truncated JSON
- **THEN** it SHALL return null
- **AND** a warning log SHALL be emitted: "[Step3] JSON parse: Unterminated string in JSON..."
- **AND** no exception SHALL propagate to the caller

#### Scenario: Valid JSON failing validation returns null

- **WHEN** `safeJsonParse('{"wrongField": 1}', "Step1", validator)` is called and validator rejects
- **THEN** it SHALL return null
- **AND** a warning log SHALL be emitted: "[Step1] validation: Missing or empty field: ..."
