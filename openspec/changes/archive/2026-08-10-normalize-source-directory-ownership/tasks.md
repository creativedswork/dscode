## 1. Architecture Guardrail Preparation

- [x] 1.1 Add explicit classifications for `slash-commands`, `project-files`, Agent definitions, Bootstrap, Kernel, Application, Adapter, Persistence, and Presentation target paths.
- [x] 1.2 Add architecture fixtures for every target source root and for an unknown top-level source root.
- [x] 1.3 Extend import analysis to retain `import type`, type-only specifier, and runtime value import metadata.
- [x] 1.4 Add fixtures proving owner-contract exceptions allow only type-only imports and reject runtime value imports across forbidden layers.
- [x] 1.5 Keep the existing zero architecture baseline while target-path support is introduced; defer old-root rejection until migration completes.

## 2. Kernel and Project File Ownership

- [x] 2.1 Move canonical containment from `src/application/path-safety.ts` to `src/kernel/path-safety.ts` and update all production imports.
- [x] 2.2 Move execution-context-aware Logger from `src/utils/logger.ts` to `src/kernel/logger.ts` and update Bootstrap, Application, Feature, and test imports.
- [x] 2.3 Move `src/utils/at-file-resolver.ts` to `src/project-files/resolver.ts` without changing resolution, limit, image, or warning semantics.
- [x] 2.4 Move `src/ui/shared/file-attachments.ts` to `src/project-files/attachments.ts` and update TUI/Web consumers.
- [x] 2.5 Move and rename the associated path-safety, at-file resolver, and attachment tests to owner-aligned test paths.
- [x] 2.6 Run canonical path, capability sandbox, context selection, at-file resolution, file attachment, Web path safety, and Logger tests.

## 3. Agent Definition Ownership

- [x] 3.1 Move all files from `src/agents/application/` to `src/agents/definitions/` without renaming domain types.
- [x] 3.2 Update production, Bootstrap, resource, script, and test imports to the Agent Definition owner.
- [x] 3.3 Update architecture owner-type fixtures and package-resource references to the new paths.
- [x] 3.4 Run Agent definition compiler, frontmatter, registry, package-resource, process spawn, and multi-Host isolation tests.
- [x] 3.5 Verify bundled, user, compatibility, project, and managed Agent precedence, digest, generation, and snapshot behavior remain unchanged.

## 4. Slash Command Ownership

- [x] 4.1 Create `src/slash-commands/types.ts` as the owner of CommandManifest, SlashCommandContext, SlashCommandPresenter, and command definition contracts.
- [x] 4.2 Move custom command loader and manager from `src/commands/` into `src/slash-commands/`.
- [x] 4.3 Move built-in command definitions and dispatch from `src/ui/commands.ts` to `src/slash-commands/builtins.ts`.
- [x] 4.4 Update TUI, Web, autocomplete, Eval, Settings, and test consumers to the unified Slash Command owner.
- [x] 4.5 Add an architecture assertion that Slash Command code imports no concrete TUI or Web adapter.
- [x] 4.6 Run Slash Command dispatch, context contract, custom manifest, autocomplete, TUI, and Web command parity tests.

## 5. Presentation Adapter Grouping

- [x] 5.1 Classify each flat `src/ui/` implementation by actual TUI-only, Web-only, or shared importers before moving it.
- [x] 5.2 Move TUI-only app, backend, conversation, activity inspector, permission input, image, MCP browser, and theme modules under `src/ui/tui/`.
- [x] 5.3 Keep `src/ui/backend.ts` as the Presentation lifecycle port and keep dual-adapter projectors, reducers, models, and formatters in `src/ui/shared/`.
- [x] 5.4 Update CLI dynamic imports, internal Presentation imports, tests, and build inputs to the grouped paths.
- [x] 5.5 Run TUI component tests, shared projector/reducer tests, Web backend tests, and a TUI/Web smoke covering prompt, Slash Command, permission, and shutdown.

## 6. Open Design Integration Ownership

- [x] 6.1 Merge `src/integrations/types.ts` into the existing Open Design type owner without duplicating IntegrationRuntimeOverride or configuration types.
- [x] 6.2 Move `src/integrations/settings-source.ts` to `src/integrations/open-design/settings.ts`.
- [x] 6.3 Update Bootstrap, Open Design preparation, configuration, MCP contribution, and test imports to Open Design-owned contracts.
- [x] 6.4 Verify no generic IntegrationRegistry, plugin SPI, shared lifecycle, Factory, or second configuration abstraction is introduced.
- [x] 6.5 Run Open Design config precedence, diagnostics, auto-start, disabled, MCP contribution, ServiceSupervisor, and shutdown tests.

## 7. Eliminate the Core Source Root

- [x] 7.1 Move `src/core/config.ts` to `src/config/loader.ts`, update configuration tests, and preserve explicit environment/current-directory inputs.
- [x] 7.2 Move `src/core/events.ts` to `src/application/events.ts` and update publishers, subscribers, HarnessAPI contracts, and tests.
- [x] 7.3 Move `src/core/harness.ts` to `src/application/harness.ts` and update Host composition and all Application consumers without changing Harness behavior.
- [x] 7.4 Remove the `src/core/main.ts` compatibility entry and point development, build, package, and test commands directly at `src/bootstrap/cli-main.ts`.
- [x] 7.5 Update remaining production, test, script, and documentation references to Config, Events, Harness, and CLI entry paths.
- [x] 7.6 Verify `src/core/` and `src/utils/` are empty and remove both directories without compatibility re-exports.

## 8. Enforce the Final Source Topology

- [x] 8.1 Make the architecture checker fail for unknown top-level `src/` roots instead of classifying them as generic Feature.
- [x] 8.2 Make the checker reject any source file under `src/core/` or `src/utils/`.
- [x] 8.3 Remove the `src/core/main.ts` composition exception and all old-path special cases.
- [x] 8.4 Enable type-only owner-contract enforcement using the AST metadata added in task 1.3.
- [x] 8.5 Update architecture fixtures and owner-type tests to target the final paths and confirm the violation baseline remains zero.
- [x] 8.6 Add a repository assertion that removed internal paths have no source, test, script, build, or documentation references.

## 9. Documentation and Full Verification

- [x] 9.1 Update `docs/ARCHITECTURE.md` source tree, owner matrix, startup flow, OS analogy, and diagrams to remove Core ambiguity and deleted IntegrationRegistry references.
- [x] 9.2 Document why Skill and MCP remain sibling owners and why Presentation capability grouping does not imply a shared backend lifecycle.
- [x] 9.3 Update README, developer commands, OpenSpec path references, and code examples affected by the migration.
- [x] 9.4 Run strict OpenSpec validation, architecture checks, TypeScript typecheck, and all focused owner contract suites.
- [x] 9.5 Run the full unit test suite and confirm no test is skipped or replaced solely because of a path move.
- [x] 9.6 Build the CLI, Web frontend, release package, and package resources; run package verification from a repository-independent working directory.
- [x] 9.7 Run CLI headless, TUI, and Web smoke tests covering startup, prompt, Slash Commands, project file attachment, MCP state, Agent launch, and graceful shutdown.
- [x] 9.8 Confirm no user-visible UI, CLI option, configuration, Session schema, Agent.md, MCP protocol, or HarnessAPI runtime behavior changed.
