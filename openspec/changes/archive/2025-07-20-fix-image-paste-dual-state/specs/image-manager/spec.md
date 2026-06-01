## ADDED Requirements

### Requirement: ImageManager SHALL own a single source of truth for pending images

`ImageManager` SHALL maintain a single internal array of `ImageContent` objects. It SHALL expose `add`, `removeLast`, `drain`, `count`, and `clear` as the only mutation surface. No consumer SHALL directly access the internal array.

#### Scenario: Add image increments count

- **WHEN** `imageManager.add(img)` is called with a valid `ImageContent`
- **THEN** `imageManager.count` SHALL return 1
- **AND** the image SHALL be stored internally

#### Scenario: Remove last image decrements count

- **WHEN** `imageManager.add(img1)` and `imageManager.add(img2)` have been called
- **AND** `imageManager.removeLast()` is called
- **THEN** `imageManager.count` SHALL return 1
- **AND** the removed image SHALL be `img2` (LIFO order)

#### Scenario: Remove last on empty manager returns undefined

- **WHEN** `imageManager.removeLast()` is called and no images exist
- **THEN** it SHALL return `undefined`
- **AND** `imageManager.count` SHALL remain 0

#### Scenario: Clear empties all images

- **WHEN** `imageManager.add(img1)` and `imageManager.add(img2)` have been called
- **AND** `imageManager.clear()` is called
- **THEN** `imageManager.count` SHALL return 0

### Requirement: ImageManager.drain() SHALL atomically capture and clear

`ImageManager.drain()` SHALL return all currently stored images as a new array and simultaneously clear the internal array. This operation SHALL be atomic — no other mutation can interleave between the capture and the clear.

#### Scenario: Drain returns all images and clears

- **WHEN** `imageManager.add(img1)` and `imageManager.add(img2)` have been called
- **AND** `const captured = imageManager.drain()` is called
- **THEN** `captured` SHALL contain `[img1, img2]`
- **AND** `imageManager.count` SHALL return 0

#### Scenario: Drain on empty returns empty array

- **WHEN** `imageManager.drain()` is called and no images exist
- **THEN** it SHALL return `[]`
- **AND** `imageManager.count` SHALL remain 0

#### Scenario: Drain does not return internal reference

- **WHEN** `imageManager.add(img)` has been called
- **AND** `const captured = imageManager.drain()` is called
- **AND** `captured.push(otherImg)` mutates the captured array
- **THEN** the internal state of `imageManager` SHALL be unaffected

### Requirement: ImagePasteHandler SHALL coordinate image lifecycle across subsystems

`ImagePasteHandler` SHALL own an `ImageManager`, and SHALL receive `Editor`, `ConversationView`, `imageStatus` Text element, and `TUI` as constructor dependencies. It SHALL expose `addImage`, `removeLastImage`, `drainImages`, `imageCount`, `clear`, and `updateStatus` as its public API.

#### Scenario: addImage pushes to ImageManager and renders draft

- **WHEN** `imagePasteHandler.addImage(img)` is called
- **THEN** it SHALL call `imageManager.add(img)`
- **AND** it SHALL insert `[image]` placeholder into the editor
- **AND** it SHALL call `conversationView.addDraftImage(img.data, img.mimeType, infoText)`
- **AND** it SHALL call `updateStatus()` to refresh the image status display
- **AND** it SHALL call `tui.requestRender(true)`

#### Scenario: removeLastImage pops from ImageManager and removes draft

- **WHEN** `imagePasteHandler.removeLastImage()` is called and images exist
- **THEN** it SHALL call `imageManager.removeLast()`
- **AND** it SHALL call `conversationView.removeLastDraftImage()`
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

#### Scenario: onChange uses removeLastImage for placeholder sync

- **WHEN** `onChange` detects that `[image]` placeholder count is less than `imagePasteHandler.imageCount`
- **THEN** it SHALL call `this.imagePasteHandler.removeLastImage()` for each missing placeholder

#### Scenario: Paste handlers use addImage

- **WHEN** any paste mechanism (Bracketed, Kitty, Ctrl+V, empty-submit) successfully reads a clipboard image
- **THEN** it SHALL call `this.imagePasteHandler.addImage(img)`
- **AND** SHALL NOT directly manipulate `pendingImages` or `imageStore`

#### Scenario: clearConversationView clears images

- **WHEN** `clearConversationView()` is called
- **THEN** it SHALL call `this.imagePasteHandler.clear()`

### Requirement: TuiApp SHALL pre-drain images on Enter before Editor onChange clears them

The `@earendil-works/pi-tui` Editor fires `onChange("")` immediately before `onSubmit` when Enter is pressed. To prevent `onChange` from removing pending images, `TuiApp` SHALL intercept the Enter key in the input listener, drain images into a `drainedSubmitImages` buffer, and skip removal in `onChange` when this buffer is non-null.

#### Scenario: Enter key pre-drains images before onChange

- **WHEN** user presses Enter AND `imagePasteHandler.imageCount > 0` AND `!processing`
- **THEN** the input listener SHALL call `imagePasteHandler.drainImages()` and store the result in `this.drainedSubmitImages`
- **AND** the Enter key SHALL pass through to the Editor
- **AND** the subsequent `onChange("")` SHALL be a no-op because `drainedSubmitImages` is non-null

#### Scenario: onChange does not remove images when pre-drained

- **WHEN** `onChange` fires AND `this.drainedSubmitImages` is non-null
- **THEN** the system SHALL NOT call `removeLastImage()`, regardless of placeholder count

#### Scenario: handleSubmit uses pre-drained images

- **WHEN** `handleSubmit` is called AND `this.drainedSubmitImages` is non-null
- **THEN** it SHALL use `this.drainedSubmitImages` as the images for submission
- **AND** it SHALL set `this.drainedSubmitImages = null` after consuming

#### Scenario: handleSubmit falls back to drainImages when no pre-drain

- **WHEN** `handleSubmit` is called AND `this.drainedSubmitImages` is null (e.g., programmatic submit via `/image` command)
- **THEN** it SHALL call `this.imagePasteHandler.drainImages()` normally

### Requirement: ImagePasteHandler.addImage SHALL insert placeholder last

To prevent `insertTextAtCursor` from triggering `onChange` before the image count is updated, `addImage` SHALL call `imageManager.add`, `addDraftImage`, `updateStatus`, and only then `insertPlaceholder`.

#### Scenario: addImage ordering prevents premature onChange removal

- **WHEN** `addImage(img)` is called
- **THEN** it SHALL execute in order: `imageManager.add(img)` → `conversation.addDraftImage(...)` → `updateStatus()` → `insertPlaceholder()`
- **AND** if `insertPlaceholder` triggers `onChange`, the image manager count SHALL already reflect the new image
