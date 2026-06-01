## ADDED Requirements

### Requirement: Vision model API call supports abort via AbortSignal
The system SHALL allow aborting an in-progress vision model API call through an `AbortSignal` passed via `ProcessOptions.signal`. When the signal is aborted, the vision model request SHALL be cancelled immediately rather than waiting for timeout.

#### Scenario: Abort during vision model streaming
- **WHEN** `describeImagesViaVisionModel` is called with an `AbortSignal` AND the signal is aborted while the vision model is streaming a response
- **THEN** the underlying `streamSimple` call SHALL terminate with an `AbortError`
- **AND** `describeImagesViaVisionModel` SHALL propagate the `AbortError` (not suppress it)

#### Scenario: No signal provided — normal operation
- **WHEN** `describeImagesViaVisionModel` is called without an `AbortSignal`
- **THEN** the function SHALL behave exactly as before (no abort support, normal streaming)

#### Scenario: Signal already aborted before call
- **WHEN** `describeImagesViaVisionModel` is called with an already-aborted `AbortSignal`
- **THEN** the underlying `streamSimple` call SHALL immediately throw an `AbortError`

### Requirement: OCR processing supports abort
The system SHALL allow aborting in-progress Tesseract.js OCR processing through an `AbortSignal`. When the signal is aborted, the Tesseract worker SHALL be terminated.

#### Scenario: Abort during OCR recognition
- **WHEN** `ocrImages` is called with an `AbortSignal` AND the signal is aborted while a worker is recognizing an image
- **THEN** the worker SHALL be terminated via `worker.terminate()`
- **AND** the function SHALL throw an `AbortError`

#### Scenario: OCR abort listeners cleaned up on success
- **WHEN** `ocrImages` completes successfully without abort
- **THEN** the abort event listener SHALL be removed from the signal
- **AND** no `worker.terminate()` call SHALL be made

### Requirement: ImagePipeline.process aborts all phases on signal
The system SHALL check the abort signal between each processing phase (compression → vision → OCR) and SHALL NOT proceed to the next phase if the signal is already aborted.

#### Scenario: Signal aborted during vision phase — skip OCR fallback
- **WHEN** `ImagePipeline.process()` vision call completes with an `AbortError` (signal was aborted during the call)
- **THEN** the pipeline SHALL NOT proceed to OCR fallback
- **AND** SHALL throw the `AbortError` to the caller

#### Scenario: Signal aborted between compression and vision
- **WHEN** `ImagePipeline.process()` is called with an `AbortSignal` AND the signal is aborted after compression but before the vision call starts
- **THEN** the pipeline SHALL throw an `AbortError` without making any vision API call

### Requirement: Harness exposes unified abort
The `Harness` class SHALL expose an `abort()` method that cancels both any in-progress vision/OCR pre-processing AND the current agent run.

#### Scenario: Abort during vision pre-processing
- **WHEN** `harness.promptWithImages()` is executing inside `imagePipeline.process()` AND `harness.abort()` is called
- **THEN** the vision/OCR call SHALL be aborted
- **AND** `promptWithImages()` SHALL NOT proceed to `agent.prompt()`
- **AND** `ui.setProcessing(false)` SHALL be called

#### Scenario: Abort during agent loop (no vision pre-processing)
- **WHEN** `agent.prompt()` is executing (no vision pre-processing in progress) AND `harness.abort()` is called
- **THEN** `agent.abort()` SHALL be called, aborting the agent loop

#### Scenario: Abort when nothing is running
- **WHEN** `harness.abort()` is called while neither vision pre-processing nor agent loop is active
- **THEN** the call SHALL be a safe no-op (no error thrown)

### Requirement: HarnessAPI includes abort method
The `HarnessAPI` interface SHALL declare `abort(): void`.

#### Scenario: UI backends can call abort via HarnessAPI
- **WHEN** TUI or Web backend has a reference typed as `HarnessAPI`
- **THEN** calling `harness.abort()` SHALL compile and work without type errors
