## Context

The `skill-toggle-persist` change added persistence and session-scope for skill toggles. However, three implementation gaps remain:

1. **No gate in `skill` tool**: The `skill` tool (`harness.ts:926-955`) loads any skill manifest via `skillManager.getManifest(name)` without checking whether the skill is active. The model can call `skill("web-game-design")` even after the user deactivated it.

2. **Misleading system prompt instruction**: Line 848 says `"Activate Skills first: if a task falls within the domain of any Skill listed in 'Available Skills', call the skill tool..."`. The "Available Skills" section (`getSystemPromptSection()`) lists ALL skills — active and inactive — with a status label. The instruction doesn't distinguish.

3. **Duplicate activation in `initialize()`**: Lines 97-112 correctly skip disabled skills. But lines 113-125 have a second, identical-looking block that activates ALL skills unconditionally — no `disabled.has(name)` check. This re-enables disabled skills at startup.

### Current attack chain (model bypassing deactivation)

```
System prompt:
  ## Available Skills
  - web-game-design (inactive): ...
  
  ## Active Skills
  ### test-echo
  ...

Runtime instruction (line 848):
  "call skill tool for ANY skill in Available Skills"
       │
       ▼
skill tool (line 930):
  getManifest("web-game-design") → loads instructions ✗
       │
       ▼
Model has full instructions → uses the "disabled" skill
```

## Goals / Non-Goals

**Goals:**
- `skill` tool SHALL reject calls for inactive skills
- System prompt SHALL instruct the model to only use active skills
- `initialize()` SHALL NOT re-activate disabled skills

**Non-Goals:**
- No changes to the settings.json schema or persistence layer
- No changes to the web UI or WebSocket protocol
- No changes to `SkillManager` API (activate/deactivate/isActive)

## Decisions

### Decision 1: Gate in `skill` tool (defense-in-depth)

**Chosen**: Add `skillManager.isActive(name)` check in the `skill` tool's `execute` function. If the skill exists but is not active, return an error message: `"Skill 'web-game-design' is currently deactivated. Use the Skills panel to activate it first."`

**Rationale**: This is the last line of defense. Even if the system prompt misleads the model, the tool itself prevents loading. The error message is user-friendly and tells the user how to re-enable.

### Decision 2: Fix system prompt instruction

**Chosen**: Change line 848 from `"any Skill listed in 'Available Skills'"` to `"any Skill listed in 'Active Skills'"`.

**Rationale**: "Active Skills" is the section that lists only activated skills with their tools. This aligns the instruction with the actual guard. The model won't be told to call `skill` for inactive skills in the first place.

### Decision 3: Remove duplicate activation loops

**Chosen**: Delete lines 113-125 (the second `for` block that activates all skills without checking `disabled`).

**Rationale**: These lines appear to be a copy-paste artifact from the original implementation. The first block (lines 97-112) is correct and sufficient. Removing the duplicate fixes startup re-activation without changing any other behavior.

## Risks / Trade-offs

- **Forward compatibility**: If `getSystemPromptSection()` is restructured and "Active Skills" section is renamed, line 848 would need updating. → Mitigation: search for the section header string, but this is already fragile. Future PR should consider making the prompt building more structural.
- **Error message in `skill` tool**: The model might retry or complain about the error. → Mitigation: The error message is clear and actionable. The model should understand and move on.

## Open Questions

None.
