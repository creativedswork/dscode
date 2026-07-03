## Context

The project currently has a full CONTRIBUTING.md that describes a multi-contributor SDD workflow (fork → clone → write spec → PR → merge). In practice, SDD-driven development is immature for multi-contributor collaboration — merge conflicts in spec files, stale task artifacts, and conflicting proposals create friction that outweighs the benefits. The project operates best as a single-developer SDD workflow.

The README files (English and Chinese) lack any contribution policy statement, leaving potential contributors to discover CONTRIBUTING.md and form incorrect expectations.

## Goals / Non-Goals

**Goals:**
- Make it immediately clear that the repo does not accept direct code contributions
- Redirect idea contributions to GitHub Issues
- Preserve the SDD philosophy explanation as informational context
- Update both English and Chinese READMEs to reflect the policy

**Non-Goals:**
- Changing any code, build, or CI configuration
- Modifying the OpenSpec pipeline or SDD tooling
- Adding any new documentation files beyond the three target files

## Decisions

### CONTRIBUTING.md: Rewrite as informational, not instructional

The current CONTRIBUTING.md is structured as a step-by-step "how to contribute" guide. The rewrite will:
- Keep the opening paragraph explaining SDD
- Replace "Quick Start" (fork/clone/PR instructions) with a clear statement that this is a single-developer project
- Keep the "Why SDD" section as context but re-frame as "How This Repo Works"
- Remove PR submission steps, reviewer guidelines, and commit conventions
- Add a section directing people to GitHub Issues for ideas and suggestions

**Alternatives considered:**
- Deleting CONTRIBUTING.md entirely — rejected because the SDD philosophy is worth documenting even if contributions aren't open
- Keeping the full guide but adding a disclaimer — rejected because it's confusing to explain a workflow and then say "but don't do this"

### README: Add a concise "Contributing" section

Add a short section near the bottom of both README files stating the single-developer policy and linking to Issues. Keep it brief — one or two sentences.

## Risks / Trade-offs

- **Risk**: Potential contributors feel unwelcome → **Mitigation**: Clear language welcoming ideas via Issues, framed as "we're not ready for code contributions yet" rather than "go away"
- **Risk**: Future policy change requires another docs update → **Mitigation**: This is intentional — when SDD matures, updating these files will be part of opening up contributions
