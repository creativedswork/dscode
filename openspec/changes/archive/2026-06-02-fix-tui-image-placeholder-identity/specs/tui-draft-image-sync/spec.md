## REMOVED Requirements

### Requirement: TuiApp SHALL synchronize pending images with editor placeholders on content change

**Reason**: LIFO-based placeholder sync replaced by ID-based set-diff approach defined in `tui-image-placeholder-identity`.

**Migration**: All placeholder synchronization behavior is now covered by `tui-image-placeholder-identity` spec's "TuiApp onChange SHALL use ID-set diff" requirement.

### Requirement: ConversationView SHALL support atomic draft image insertion and removal

**Reason**: LIFO stack-based draft management replaced by ID-keyed draft management defined in `tui-image-placeholder-identity`.

**Migration**: All draft image management behavior is now covered by `tui-image-placeholder-identity` spec's "ConversationView SHALL support draft image removal by ID" requirement.

---

## MODIFIED Requirements

### Requirement: ImagePasteHandler SHALL coordinate image lifecycle across subsystems

`ImagePasteHandler` SHALL own an `ImageManager`, and SHALL receive `Editor`, `ConversationView`, `imageStatus` Text element, and `TUI` as constructor dependencies. It SHALL expose `addImage`, `removeImageById`, `getAllIds`, `drainImages`, `imageCount`, `clear`, and `updateStatus` as its public API. `removeLastImage()` SHALL be removed.

#### Scenario: addImage pushes to ImageManager and renders draft

- **WHEN** `imagePasteHandler.addImage(img)` is called
- **THEN** it SHALL call `imageManager.add(img)` and receive an id
- **AND** it SHALL insert `[image:<id>]` placeholder into the editor
- **AND** it SHALL call `conversationView.addDraftImage(id, img.data, img.mimeType, infoText)`
- **AND** it SHALL call `updateStatus()` to refresh the image status display
- **AND** it SHALL call `tui.requestRender(true)`
- **AND** it SHALL return the assigned id

#### Scenario: removeImageById removes from ImageManager and draft

- **WHEN** `imagePasteHandler.removeImageById(id)` is called and an image with that id exists
- **THEN** it SHALL call `imageManager.removeById(id)`
- **AND** it SHALL call `conversationView.removeDraftImageById(id)`
- **AND** it SHALL call `updateStatus()`

#### Scenario: drainImages captures and clears atomically

- **WHEN** `imagePasteHandler.drainImages()` is called
- **THEN** it SHALL return the result of `imageManager.drain()`
- **AND** `imagePasteHandler.imageCount` SHALL return 0

#### Scenario: clear resets all state

- **WHEN** `imagePasteHandler.clear()` is called
- **THEN** it SHALL call `imageManager.clear()`
- **AND** it SHALL call `updateStatus()`

### Requirement: TuiApp SHALL delegate image lifecycle to ImagePasteHandler

`TuiApp` SHALL construct a single `ImagePasteHandler` instance and delegate all image operations to it. `TuiApp` SHALL NOT directly access `pendingImages`, `imageStore`, or `ImageManager`.

#### Scenario: handleSubmit uses drainImages before setText

- **WHEN** user presses Enter to submit
- **THEN** `handleSubmit` SHALL call `this.imagePasteHandler.drainImages()` BEFORE calling `this.editor.setText("")`
- **AND** `handleSubmit` SHALL use the returned images for model submission

#### Scenario: onChange uses ID-set diff for placeholder sync

- **WHEN** `onChange` fires with editor text
- **THEN** it SHALL extract all valid `[image:<id>]` IDs via regex `\[image:(\d+)\]`
- **AND** it SHALL compare the extracted ID set against `imagePasteHandler.getAllIds()`
- **AND** for each active ID not present in the text, it SHALL call `imagePasteHandler.removeImageById(id)`

#### Scenario: Paste handlers use addImage

- **WHEN** any paste mechanism (Bracketed, Kitty, Ctrl+V, empty-submit) successfully reads a clipboard image
- **THEN** it SHALL call `this.imagePasteHandler.addImage(img)`
- **AND** SHALL NOT directly manipulate `ImageManager`

#### Scenario: clearConversationView clears images

- **WHEN** `clearConversationView()` is called
- **THEN** it SHALL call `this.imagePasteHandler.clear()`
