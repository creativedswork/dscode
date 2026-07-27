## ADDED Requirements

### Requirement: Thinking level accounts for thinkingLevelMap constraints
The `getThinkingLevel` function SHALL consider the model's `thinkingLevelMap` (if present) when determining the recommended thinking level. If `reasoning: true` and `thinkingLevelMap` has exactly one non-null entry at `"max"`, the function SHALL return `"max"`. If `reasoning: true` and `thinkingLevelMap` has no non-null entries, the function SHALL return `"off"`. In all other cases, the existing `reasoning → "high"`, non-reasoning → `"off"` logic applies.

#### Scenario: Model with only "max" thinking support gets "max"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and `thinkingLevelMap: { off: null, minimal: null, low: null, medium: null, high: null, xhigh: null, max: "max" }`
- **THEN** the system returns `"max"`

#### Scenario: Model with no effective thinking levels gets "off"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and `thinkingLevelMap` where all entries are `null`
- **THEN** the system returns `"off"`

#### Scenario: Model without thinkingLevelMap uses existing heuristic
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: true` and no `thinkingLevelMap`
- **THEN** the system returns `"high"` (unchanged behavior)

#### Scenario: Non-reasoning model still returns "off"
- **WHEN** `getThinkingLevel` is called for a model with `reasoning: false`
- **THEN** the system returns `"off"` (unchanged behavior)
