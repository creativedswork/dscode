## REMOVED Requirements

### Requirement: Rule extraction from CHIFF causal graph

**Reason**: The `extractRules` function and detector registry are replaced by LLM-driven rule attribution (`attributeWithLLM`). Deterministic detectors (e.g., `bashFileOpRatio`, pattern matching on tool usage) cannot identify config-level issues with the same semantic depth as the LLM.

**Migration**: `extractRules` and all registered detectors are deleted. Rule extraction now goes exclusively through `attributeWithLLM` in Step 7, which receives the full CHIFF context rather than pre-defined pattern templates.

### Requirement: Step 7 — Rule abstraction from attribution

**Reason**: The deterministic CHIFF→Rule mapping (Rule1→R_FIX_CASCADE, Rule2→R_DATA_MISINTERPRET, Rule3→R_IRRECOVERABLE_ACTION) is deleted. The LLM autonomously decides which rules to generate based on the full CHIFF context, not a pre-defined mapping table.

**Migration**: Step 7 now uses `attributeWithLLM` exclusively. The deterministic mapping logic is removed.

### Requirement: De-concretization of session-specific details

**Reason**: De-concretization is now handled by the LLM as part of rule generation (it's instructed to produce de-concretized abstracts). A separate deterministic de-concretization step is unnecessary.

**Migration**: The LLM prompt for Step 7 already includes de-concretization instructions. No code changes needed beyond removing the deterministic de-concretization function.

### Requirement: LLM-assisted rule extraction for identity/taste rules

**Reason**: All rules are now LLM-generated. The distinction between "needs_llm: true" rules (identity/taste) and deterministic rules is obsolete — every rule goes through the LLM.

**Migration**: The `needsLlm` field is already removed from `HarnessRule` (see `eval-llm-rule-attribution` spec). The separate LLM call for identity/taste rules is absorbed into the unified Step 7 LLM call.

### Requirement: Extraction runs after CHIFF pipeline, before dashboard

**Reason**: The rule-engine fallback path ("extractRules SHALL still be called with session statistics") is no longer applicable. Rule extraction only runs after successful CHIFF pipeline completion.

**Migration**: Remove the `extractRules` function. Step 7 `attributeWithLLM` always runs after Step 6 with full graph context.
