## Why

`TuiApp` manages image lifecycle with two arrays — `pendingImages` (UI layer, mutable by `onChange`) and `imageStore` (data layer, "immune to onChange"). This dual-state anti-pattern has no explicit synchronization contract, producing a state space of N×M where most combinations are illegal but the type system cannot enforce consistency. A single "paste → delete → paste → send" sequence required 6 fix attempts. The short-term patch (double `slice` sync at paste + submit) masks the symptom but leaves the architectural debt: 4 identical paste-site blocks, fragile synchronization logic scattered across 6 methods, and `tui-app.ts` at 1047 lines.

## What Changes

- **Introduce `ImageManager`**: A single-array class that is the exclusive owner of image data, exposing `add`, `removeLast`, `getAll`, `drain`, `count`, and `clear`. No dual arrays, no synchronization needed.
- **Replace all raw `pendingImages`/`imageStore` manipulation** in `TuiApp` with `ImageManager` calls — eliminating 4 duplicate paste-site blocks and the `slice`/`push` sync dance.
- **Extract `ImagePasteHandler`**: A dedicated subsystem owning `ImageManager`, clipboard reading, placeholder insertion, draft rendering coordination, and image status updates. `TuiApp` delegates image concerns to it.
- **Shrink `tui-app.ts`** from ~1047 lines toward ~300 lines by removing image-related logic.

## Capabilities

### New Capabilities
- `image-manager`: Single-source-of-truth image lifecycle manager with atomic `drain()` for submit-time capture-and-clear, replacing the dual-array `pendingImages`/`imageStore` pattern.

### Modified Capabilities
<!-- None — existing spec behavioral requirements (tui-draft-image-sync, tui-paste-notification) are unchanged. Implementation details shift from dual arrays to ImageManager. -->

## Impact

- **`src/ui/tui-app.ts`**: Replace ~120 lines of dual-array image logic with delegation to `ImagePasteHandler`
- **New `src/ui/image-manager.ts`**: ~60 lines, single-array ImageContent manager
- **New `src/ui/image-paste-handler.ts`**: ~150 lines, orchestrates paste detection, ImageManager, ConversationView draft rendering, and status display
- **Affected methods**: `onChange`, `handlePasteImage`, `handleKittyImageProtocol`, `pasteClipboardImage`, `handleSubmit`, `addPendingImage`, `updateImageStatus`, `clearConversationView`
- **No API or protocol changes** — purely internal refactor
- **Risk**: Low. Behavioral contracts are unchanged; ImageManager is testable in isolation; rollback is a single commit revert
