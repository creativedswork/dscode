## Why

`skill-toggle-persist` successfully persists disabled skill state to settings.json and rebuilds the system prompt on session reset, but three implementation gaps allow the model to bypass skill deactivation: the `skill` tool loads any skill manifest regardless of active status, the system prompt instructs the model to call `skill` for every skill in "Available Skills" (including inactive ones), and a duplicate activation loop in `initialize()` re-activates disabled skills at startup.

## What Changes

- **`skill` tool gates on active status**: The `skill` tool (harness.ts:930) shall reject calls for inactive skills instead of loading their instructions
- **System prompt instruction fixed**: The runtime instruction at line 848 shall reference only active skills, not all "Available Skills"
- **Duplicate activation loop removed**: The second set of activation loops in `initialize()` (lines 113-125) that activate all skills without checking `disabledSkills` shall be removed

## Capabilities

### New Capabilities

- `skill-load-gate`: The `skill` tool and system prompt instruction SHALL prevent the model from loading or using deactivated skills

### Modified Capabilities

None. Existing spec requirements from `skill-persistence` remain correct — these are implementation bugs, not requirement changes.

## Impact

- `src/core/harness.ts` — `skill` tool execute function (line 930), system prompt building (line 848), `initialize()` activation loops (lines 97-125)
