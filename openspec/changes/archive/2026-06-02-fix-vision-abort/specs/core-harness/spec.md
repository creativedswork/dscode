## ADDED Requirements

### Requirement: Harness exposes abort method
The `Harness` class SHALL expose a public `abort(): void` method. When called, it SHALL abort the visionAbortController (if one is active for in-progress image pre-processing) AND call `this.agent.abort()`.

#### Scenario: Abort during image pre-processing
- **WHEN** `harness.abort()` is called while `promptWithImages()` is executing inside `imagePipeline.process()`
- **THEN** the vision/OCR call SHALL be aborted via `visionAbortController.abort()`
- **AND** `agent.abort()` SHALL also be called

#### Scenario: Abort during agent loop
- **WHEN** `harness.abort()` is called while the agent loop is running (no image pre-processing active)
- **THEN** `agent.abort()` SHALL be called
- **AND** no error SHALL be thrown (the absent visionAbortController is handled gracefully)

#### Scenario: Abort when idle
- **WHEN** `harness.abort()` is called while nothing is running
- **THEN** the call SHALL complete without throwing

## MODIFIED Requirements

### Requirement: Harness delegates image processing to ImagePipeline
The `Harness` class SHALL instantiate `ImagePipeline` once in its constructor and expose it via `this.imagePipeline`. The `promptWithImages()` method SHALL delegate to `this.imagePipeline.process()`. Before calling `process()`, `promptWithImages()` SHALL create a fresh `AbortController` and pass its signal via `ProcessOptions.signal`. After `process()` completes or throws, `promptWithImages()` SHALL clear the abort controller reference. If `process()` throws an `AbortError`, `promptWithImages()` SHALL call `ui.setProcessing(false)` and return without calling `agent.prompt()`.

#### Scenario: Harness constructs ImagePipeline
- **WHEN** `Harness` is instantiated
- **THEN** `this.imagePipeline` is set to `new ImagePipeline({ visionConfig: config.vision, cacheDir, onWarning: (msg) => this.ui.addWarning(msg) })`

#### Scenario: promptWithImages delegates to ImagePipeline with abort signal
- **WHEN** `harness.promptWithImages(text, images)` is called
- **THEN** it SHALL create a new `AbortController` and store it as `this.visionAbortController`
- **AND** call `this.imagePipeline.process(images, text, { signal: visionAbortController.signal })`
- **AND** clear `this.visionAbortController` after the call completes or throws

#### Scenario: promptWithImages handles AbortError from pipeline
- **WHEN** `this.imagePipeline.process()` throws an `AbortError`
- **THEN** `promptWithImages()` SHALL call `this.ui.setProcessing(false)`
- **AND** SHALL NOT call `agent.prompt()`
- **AND** SHALL clear `this.visionAbortController`

#### Scenario: promptWithImages handles non-AbortError from pipeline
- **WHEN** `this.imagePipeline.process()` throws a non-`AbortError`
- **THEN** `promptWithImages()` SHALL re-throw the error (existing behavior)
- **AND** clear `this.visionAbortController`

### Requirement: HarnessAPI includes abort method
The `HarnessAPI` interface SHALL declare `abort(): void` so that UI backends (TUI, Web) can call abort through the typed interface.

#### Scenario: HarnessAPI abort declaration
- **WHEN** code references `harness.abort()` through a `HarnessAPI` type
- **THEN** TypeScript SHALL compile without type errors
