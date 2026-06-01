## ADDED Requirements

### Requirement: TuiApp SHALL synchronize pending images with editor placeholders on content change

When the TUI prompt editor content changes, `TuiApp` SHALL compare the count of `[image]` placeholders in the editor text against `pendingImages.length`. If the placeholder count is less than the pending images count, the system SHALL remove the excess images from `pendingImages[]` and remove the corresponding draft image groups from the conversation view, in LIFO order.

#### Scenario: User deletes a single image placeholder

- **WHEN** the editor has text containing one `[image]` placeholder and `pendingImages` contains one image
- **AND** the user deletes the `[image]` text from the editor
- **THEN** `pendingImages` SHALL become empty
- **AND** the conversation view SHALL remove the draft image blocks (file path text block, image block if any, and info text block) associated with that paste
- **AND** `imageStatus` SHALL clear to empty text

#### Scenario: User pastes three images then deletes one placeholder

- **WHEN** the editor has text containing three `[image]` placeholders and `pendingImages` contains three images
- **AND** the user deletes one `[image]` placeholder
- **THEN** `pendingImages` SHALL contain two images
- **AND** the conversation view SHALL remove only the most recently added draft image group
- **AND** `imageStatus` SHALL update to reflect two images

#### Scenario: User deletes all image placeholders

- **WHEN** the editor has text containing multiple `[image]` placeholders
- **AND** the user deletes all of them
- **THEN** `pendingImages` SHALL become empty
- **AND** all draft image groups SHALL be removed from the conversation view
- **AND** `imageStatus` SHALL clear to empty text

#### Scenario: Placeholder count exceeds pending images (no-op)

- **WHEN** the editor text contains `[image]` but `pendingImages` is empty (e.g., user manually typed the string)
- **THEN** the system SHALL NOT modify `pendingImages` or the conversation view

#### Scenario: Placeholder count matches pending images (no-op)

- **WHEN** the editor text `[image]` count equals `pendingImages.length`
- **THEN** the system SHALL NOT modify `pendingImages` or the conversation view

### Requirement: ConversationView SHALL support atomic draft image insertion and removal

`ConversationView` SHALL provide `addDraftImage(base64Data, mimeType, infoText)` that atomically adds all blocks associated with a single image paste (file path text, optional inline image, info text) and records the block count on an internal LIFO stack. It SHALL provide `removeLastDraftImage()` that pops the last group from the stack and removes the corresponding blocks from both the internal blocks array and the rendered Box children.

#### Scenario: addDraftImage saves to cache and adds blocks

- **WHEN** `addDraftImage(base64Data, "image/png", "Image pasted...")` is called
- **THEN** the image SHALL be saved to `~/.dscode/image-cache/` as a file
- **AND** a text block `[image: <filepath>]` SHALL be added to the blocks array
- **AND** an image block SHALL be added to the blocks array
- **AND** an info text block SHALL be added to the blocks array
- **AND** the total block count (3 for PNG) SHALL be pushed onto the draft image block count stack
- **AND** the box SHALL render the new blocks

#### Scenario: addDraftImage with JPEG skips inline image block

- **WHEN** `addDraftImage(base64Data, "image/jpeg", "Image pasted...")` is called
- **THEN** a text block `[image: <filepath>]` SHALL be added
- **AND** NO image block SHALL be added (JPEG not supported by terminal graphics protocols)
- **AND** an info text block SHALL be added
- **AND** the total block count (2 for JPEG) SHALL be pushed onto the draft image block count stack

#### Scenario: removeLastDraftImage removes exactly the last group

- **WHEN** `removeLastDraftImage()` is called and the draft image block count stack has `[3]` on top
- **THEN** the last 3 blocks SHALL be removed from the blocks array
- **AND** the last 3 children SHALL be removed from `box.children`
- **AND** `renderedBlockCount` SHALL be decremented by 3
- **AND** the stack SHALL pop the 3

#### Scenario: removeLastDraftImage on empty stack is a no-op

- **WHEN** `removeLastDraftImage()` is called and the draft image block count stack is empty
- **THEN** the system SHALL NOT modify blocks, box children, or renderedBlockCount
