## Why

The repo is entirely SDD-driven, and the current SDD pipeline is not mature enough for multi-contributor collaboration (merge conflicts in spec files, stale task artifacts, conflicting change proposals). The project works best as a single-developer effort for now. However, CONTRIBUTING.md still reads like an open-contribution guide (fork → PR → merge), and neither README nor the Chinese README clearly state the contribution policy. This creates false expectations for potential contributors.

## What Changes

- **CONTRIBUTING.md**: Rewrite to clearly state this is a single-developer SDD project. Remove PR workflow instructions, fork/clone/PR sections, and reviewer guidelines. Keep the SDD philosophy explanation but frame it as informational ("how this repo works") rather than instructional ("how you should contribute"). Add a section directing idea contributions to GitHub Issues.
- **README.md**: Add a "Contributing" section (or note near the top) stating the single-developer policy and pointing to Issues for ideas.
- **README.zh-CN.md**: Mirror the same "Contributing" section in Chinese.

## Capabilities

### New Capabilities

_None._ This is a documentation-only change with no new functional capabilities.

### Modified Capabilities

_None._ No existing spec-level behavior changes.

## Impact

- Affected files: `CONTRIBUTING.md`, `README.md`, `README.zh-CN.md`
- No code, API, or dependency changes
- No tests needed
- No breaking changes
