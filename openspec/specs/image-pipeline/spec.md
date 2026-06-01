# image-pipeline Specification

## Purpose
Unified image processing module residing under drivers/ as a perception driver — reader, cache, OCR, vision model client, and fallback orchestration consumed by both user-input and MCP-tool-result paths.
## Requirements
### Requirement: ImagePipeline Module Structure
The system SHALL provide an `ImagePipeline` class in `src/drivers/vision/` that consolidates all image processing — reading, caching, OCR, vision model invocation, and fallback orchestration — into a single module. The directory SHALL contain: `index.ts` (barrel export), `types.ts` (shared types), `reader.ts` (file/clipboard reading), `cache.ts` (compression/storage), `ocr.ts` (Tesseract.js), `client.ts` (vision model API), and `pipeline.ts` (orchestration).

#### Scenario: ImagePipeline directory exists
- **WHEN** the refactoring is complete
- **THEN** `src/drivers/vision/` exists with `index.ts`, `types.ts`, `reader.ts`, `cache.ts`, `ocr.ts`, `client.ts`, and `pipeline.ts`

#### Scenario: Barrel export works
- **WHEN** a consumer imports `from "../drivers/vision/index.js"`
- **THEN** it receives `ImagePipeline`, `ImageRef`, `ImageContent`, and related types


### Requirement: ImagePipeline.process() Unified Method
The `ImagePipeline` class SHALL expose a `process(images: ImageContent[], text: string, options?: { onProgress?: ProgressFn; signal?: AbortSignal }): Promise<ProcessResult>` method that handles the full vision→OCR→fallback chain. The method SHALL accept an optional `AbortSignal` via `options.signal` and pass it to both vision model and OCR calls. If the signal is aborted at any point, the method SHALL throw an `AbortError` and not proceed to subsequent phases. The method SHALL be used by both user-input paths (via `Harness.promptWithImages`) and MCP tool-result paths (via `MCPManager.buildAgentTool`).

#### Scenario: Vision model available — successful description
- **WHEN** `process()` is called with images AND a vision model is configured and available
- **THEN** it SHALL compress images via ImageCache, call the vision model with the provided signal, and return `{ enrichedText: text + description, cachedRefs: ImageRef[], source: "vision" }`

#### Scenario: Abort signal received during vision call — throw AbortError
- **WHEN** `process()` is called with an `AbortSignal` AND the signal is aborted during the vision model API call
- **THEN** it SHALL throw an `AbortError`
- **AND** SHALL NOT proceed to OCR fallback
- **AND** SHALL NOT return a `ProcessResult`

#### Scenario: Abort signal received during OCR call — throw AbortError
- **WHEN** `process()` is called with an `AbortSignal` AND vision fails (non-abort) AND the signal is aborted during OCR
- **THEN** it SHALL throw an `AbortError`

#### Scenario: Vision model returns empty description — fallback to OCR
- **WHEN** `process()` calls the vision model AND the model returns an empty or whitespace-only description
- **THEN** it SHALL fall back to OCR on the same images
- **AND** return `{ enrichedText: text + ocrText, cachedRefs: ImageRef[], source: "ocr" }`

#### Scenario: Vision model fails — fallback to OCR
- **WHEN** `process()` calls the vision model AND the API returns an error or times out
- **THEN** it SHALL fall back to OCR
- **AND** emit a warning via the configured `onWarning` callback with details about the vision failure

#### Scenario: OCR finds useful text
- **WHEN** `process()` runs OCR as fallback AND OCR extracts non-empty, non-whitespace text
- **THEN** it SHALL return `{ enrichedText: text + ocrText, cachedRefs: ImageRef[], source: "ocr" }`

#### Scenario: OCR finds no useful text
- **WHEN** `process()` runs OCR as fallback AND OCR returns empty or whitespace-only text
- **THEN** it SHALL return `{ enrichedText: text, cachedRefs: ImageRef[], source: "none" }`
- **AND** SHALL NOT pass an empty message to the main model

#### Scenario: Vision fails and OCR also fails
- **WHEN** both vision model and OCR fail
- **THEN** it SHALL return `{ enrichedText: text + "[Image(s) could not be processed]", cachedRefs: ImageRef[], source: "error" }`

#### Scenario: onProgress callback for MCP intermediate state
- **WHEN** `process()` is called with `options.onProgress`
- **THEN** it SHALL call `onProgress({ phase: "compressing" | "describing" | "ocr" | "done", cachedRefs: ImageRef[] })` at each phase transition
- **AND** the caller (MCPManager) can use this to emit intermediate UI updates

#### Scenario: No signal provided — backward compatible
- **WHEN** `process()` is called without `options.signal`
- **THEN** it SHALL behave exactly as before (no abort capability for this call)


### Requirement: ImagePipeline constructor dependencies
The `ImagePipeline` constructor SHALL accept: a `VisionConfig` (provider, model ID, API key), a file path for the cache directory, and an optional `onWarning: (message: string) => void` callback for non-fatal error reporting.

#### Scenario: ImagePipeline instantiated with config
- **WHEN** `new ImagePipeline({ visionConfig, cacheDir, onWarning })` is called
- **THEN** it initializes internal ImageCache, OCR engine, and vision client

#### Scenario: ImagePipeline instantiated without vision config
- **WHEN** `new ImagePipeline({ cacheDir, onWarning })` is called without `visionConfig`
- **THEN** it SHALL skip vision model attempts and go directly to OCR fallback

### Requirement: ImagePipeline used by Harness
The `Harness` class SHALL instantiate `ImagePipeline` once in its constructor and expose it via `this.imagePipeline`. The `promptWithImages()` method SHALL delegate to `this.imagePipeline.process()`.

#### Scenario: Harness constructs ImagePipeline
- **WHEN** `Harness` is instantiated
- **THEN** `this.imagePipeline` is set to `new ImagePipeline({ visionConfig: config.vision, cacheDir, onWarning: (msg) => this.ui.addWarning(msg) })`

#### Scenario: promptWithImages delegates to ImagePipeline
- **WHEN** `harness.promptWithImages(text, images)` is called
- **THEN** it SHALL call `this.imagePipeline.process(images, text)` and use the result for `promptAndSave()`

### Requirement: ImagePipeline used by MCPManager
The `MCPManager` SHALL receive `ImagePipeline` via constructor or setter. The `buildAgentTool().execute()` method SHALL delegate image processing to `this.imagePipeline.process()` instead of inline compression and vision calls. The `visionResolve` and `visionDescribe` public callback fields on MCPManager SHALL be removed.

#### Scenario: MCPManager receives ImagePipeline
- **WHEN** `MCPManager` is constructed
- **THEN** it stores the `ImagePipeline` instance for use in `buildAgentTool`

#### Scenario: MCP tool images processed via ImagePipeline
- **WHEN** an MCP tool result contains `ImageContent` blocks
- **THEN** `buildAgentTool().execute()` calls `this.imagePipeline.process(imageBlocks, "", { onProgress })` instead of inline compression + vision calls

#### Scenario: MCP tool result excludes base64 when model doesn't support images
- **WHEN** the main model does NOT support image input AND MCP tool result images are processed via ImagePipeline
- **THEN** the returned `AgentToolResult.content` SHALL NOT contain `ImageContent` blocks
- **AND** SHALL contain only text blocks and the vision/OCR description text

### Requirement: ImagePipeline Tests
The `ImagePipeline` module SHALL have tests covering core paths: successful vision description, empty vision description → OCR fallback, vision API error → OCR fallback, OCR with useful text, OCR with no useful text, and double failure (vision + OCR both fail).

#### Scenario: Test — vision success
- **WHEN** a test calls `pipeline.process(mockImages, "Describe:")` with a mock vision client that returns "A screenshot of code"
- **THEN** the result SHALL be `{ enrichedText: "Describe: A screenshot of code", source: "vision" }`

#### Scenario: Test — vision empty response fallback
- **WHEN** a test calls `pipeline.process(mockImages, "Describe:")` with a mock vision client that returns ""
- **THEN** the system SHALL call OCR fallback

#### Scenario: Test — vision error fallback
- **WHEN** a test calls `pipeline.process(mockImages, "Describe:")` with a mock vision client that throws
- **THEN** the system SHALL call OCR fallback AND invoke `onWarning`

#### Scenario: Test — OCR no text
- **WHEN** both vision and OCR return empty results
- **THEN** the result SHALL have `source: "none"` and `enrichedText` SHALL equal the original text unchanged

