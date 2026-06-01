## MODIFIED Requirements

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
