## ADDED Requirements

### Requirement: ImageManager SHALL assign unique IDs and support by-ID operations

`ImageManager` SHALL assign IDs via smallest-available-slot allocation. `add(img)` SHALL find the smallest positive integer not currently in use, assign it, store the image, and return the id. `removeById(id)` SHALL remove the image with the given id and return `true`, or return `false` if no such image exists. `getById(id)` SHALL return the image or `undefined`. `drain()` SHALL return images in insertion order as before. `clear()` SHALL empty images and release all IDs (next add gets 1). `count` and `totalBase64Bytes` SHALL continue to iterate over all stored images.

#### Scenario: Add images returns sequential IDs

- **WHEN** `manager.add(imgA)` is called
- **THEN** it SHALL return `1`
- **AND** `manager.add(imgB)` SHALL return `2`
- **AND** `manager.count` SHALL be `2`

#### Scenario: Remove by ID removes the correct image

- **WHEN** `manager.add(imgA)` returns `1` and `manager.add(imgB)` returns `2`
- **AND** `manager.removeById(1)` is called
- **THEN** it SHALL return `true`
- **AND** `manager.getById(1)` SHALL return `undefined`
- **AND** `manager.getById(2)` SHALL return `imgB`
- **AND** `manager.count` SHALL be `1`

#### Scenario: Remove by non-existent ID is a no-op

- **WHEN** `manager.removeById(99)` is called and no image with id 99 exists
- **THEN** it SHALL return `false`
- **AND** `manager.count` SHALL be unchanged

#### Scenario: Drain preserves insertion order

- **WHEN** `manager.add(imgA)` returns `1` and `manager.add(imgB)` returns `2`
- **AND** `manager.drain()` is called
- **THEN** the returned array SHALL be `[imgA, imgB]`
- **AND** `manager.count` SHALL be `0`

#### Scenario: Clear resets nextId

- **WHEN** `manager.add(imgA)` returns `1`
- **AND** `manager.clear()` is called
- **AND** `manager.add(imgB)` is called
- **THEN** the second call SHALL return `1` (smallest available slot)

### Requirement: ImagePasteHandler SHALL use ID-based placeholders and support by-ID removal

`ImagePasteHandler` SHALL generate `[image:<id>]` placeholders where `<id>` is the monotonically increasing integer returned by `ImageManager.add()`. `addImage(img)` SHALL return the assigned id. `removeImageById(id)` SHALL call `imageManager.removeById(id)` and `conversation.removeDraftImageById(id)`. `getAllIds()` SHALL return all currently active image IDs in insertion order. The static `PLACEHOLDER` format SHALL be `[image:<id>]`. `removeLastImage()` SHALL be removed from the public API.

#### Scenario: addImage inserts ID-based placeholder

- **WHEN** `handler.addImage(imgA)` is called
- **THEN** it SHALL insert `[image:1] ` into the editor
- **AND** it SHALL return `1`

#### Scenario: Multiple images get sequential IDs in placeholder

- **WHEN** `handler.addImage(imgA)` and `handler.addImage(imgB)` are called
- **THEN** the editor text SHALL contain `[image:1] [image:2]`
- **AND** `handler.getAllIds()` SHALL return `[1, 2]`

#### Scenario: removeImageById removes the correct image

- **WHEN** images with IDs 1 and 2 exist
- **AND** `handler.removeImageById(1)` is called
- **THEN** `handler.getAllIds()` SHALL return `[2]`
- **AND** conversation draft for id 1 SHALL be removed

#### Scenario: removeImageById with non-existent id is a no-op

- **WHEN** `handler.removeImageById(99)` is called and no image with id 99 exists
- **THEN** `handler.imageCount` SHALL be unchanged
- **AND** `handler.getAllIds()` SHALL be unchanged

### Requirement: ConversationView SHALL support draft image removal by ID

`ConversationView` SHALL expose `addDraftImage(id, base64Data, mimeType, infoText)` that records the associated block positions keyed by the given id, and `removeDraftImageById(id)` that removes the blocks associated with that id from both the internal blocks array and rendered Box children. The LIFO `removeLastDraftImage()` SHALL be removed.

#### Scenario: addDraftImage records blocks by ID

- **WHEN** `conv.addDraftImage(1, base64Data, "image/png", "info")` is called
- **THEN** the blocks SHALL be added to the conversation view
- **AND** SHALL be retrievable for removal by id `1`

#### Scenario: removeDraftImageById removes correct blocks

- **WHEN** `conv.addDraftImage(1, dataA, "image/png", "infoA")` and `conv.addDraftImage(2, dataB, "image/png", "infoB")` are called
- **AND** `conv.removeDraftImageById(1)` is called
- **THEN** the blocks for id 1 SHALL be removed
- **AND** the blocks for id 2 SHALL remain intact

#### Scenario: removeDraftImageById on non-existent id is a no-op

- **WHEN** `conv.removeDraftImageById(99)` is called and no draft with id 99 exists
- **THEN** blocks, box children, and renderedBlockCount SHALL be unchanged

### Requirement: TuiApp onChange SHALL use ID-set diff for image synchronization

When the TUI prompt editor content changes, `TuiApp` SHALL extract all valid `[image:<id>]` IDs from the text using regex `\[image:(\d+)\]`. It SHALL compute the set difference between active image IDs and present placeholder IDs. For each missing ID, it SHALL call `imagePasteHandler.removeImageById(id)`. Placeholder text that does not match the exact format SHALL be treated as deletion of any previously existing IDs no longer present.

#### Scenario: User deletes the first of two image placeholders

- **WHEN** the editor contains `[image:1] text [image:2]` and images with IDs 1 and 2 exist
- **AND** the user deletes `[image:1]` leaving text `text [image:2]`
- **THEN** `handler.getAllIds()` SHALL return `[2]` (image 1 removed, image 2 retained)

#### Scenario: User deletes the second of two image placeholders

- **WHEN** the editor contains `[image:1] [image:2]` and images with IDs 1 and 2 exist
- **AND** the user deletes `[image:2]` leaving text `[image:1] `
- **THEN** `handler.getAllIds()` SHALL return `[1]` (image 2 removed, image 1 retained)

#### Scenario: User deletes all image placeholders

- **WHEN** the editor contains `[image:1] [image:2] [image:3]` and all three images exist
- **AND** the user deletes all placeholder text
- **THEN** `handler.getAllIds()` SHALL return `[]`
- **AND** all draft image groups SHALL be removed from the conversation view

#### Scenario: User corrupts a placeholder

- **WHEN** the editor contains `[image:1] [image:2]` and both images exist
- **AND** the user edits `[image:1]` to `[image: 1]` (extra space)
- **THEN** image with id 1 SHALL be removed (no longer matches regex)
- **AND** image with id 2 SHALL remain

#### Scenario: Editor contains placeholder IDs with no matching images

- **WHEN** the editor contains `[image:99]` but no image with id 99 exists
- **THEN** the system SHALL NOT modify `imagePasteHandler` (no-op for unknown IDs)

#### Scenario: Placeholder count matches images exactly

- **WHEN** the editor contains `[image:1] [image:2]` and images with IDs 1 and 2 exist
- **AND** the user moves cursor without changing placeholders
- **THEN** no images SHALL be added or removed
