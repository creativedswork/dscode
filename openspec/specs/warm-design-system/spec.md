## Purpose

Defines the warm monochrome design system — a premium, editorial-style visual language for the dscode web UI, covering color palette, typography, spacing, animation, and component shape language.
## Requirements
### Requirement: Warm monochrome color palette
The design system SHALL define a warm-toned color palette using warm stone/taupe gray neutrals with one controlled accent color. The palette MUST avoid the cream/beige + brass/oxblood AI-default family. Both light and dark variants MUST be provided via CSS custom properties.

#### Scenario: Light mode neutrals
- **WHEN** the `:root` stylesheet is active (no `.dark` class on `<html>`)
- **THEN** the background is a warm gray-white (≈ `#f8f7f5`), surfaces are slightly warmer off-white (≈ `#f3f2ef`), borders are a subtle warm gray (≈ `#e6e4e0`), body text is warm charcoal (≈ `#2d2a26`), and muted text is warm medium gray (≈ `#8a8580`)

#### Scenario: Light mode accent
- **WHEN** the accent color is used for interactive elements (buttons, links, highlights, focus rings)
- **THEN** it is exactly ONE controlled accent — a warm amber/gold (≈ `#b8860b` or `#ca8a04`) at low saturation — used consistently across all components, never competing with a second accent

#### Scenario: Status colors
- **WHEN** success, error, or warning states are displayed
- **THEN** they use muted pastel backgrounds: success is pale green (≈ `#edf4ed` bg, `#347539` text), error is pale red (≈ `#fdebec` bg, `#9f2f2d` text), warning is pale amber (≈ `#fbf3db` bg, `#956400` text)

#### Scenario: Dark mode neutrals
- **WHEN** the `.dark` class is applied to `<html>`
- **THEN** the background shifts to a warm deep gray-brown (≈ `#1e1c19`), surfaces to slightly lighter warm dark gray (≈ `#282622`), text to warm off-white (≈ `#e8e4dd`), muted text to warm medium-dark gray (≈ `#8a8580`), and borders to warm dark border gray (≈ `#3a3732`)

#### Scenario: Smooth theme transition
- **WHEN** the theme class is toggled on `<html>`
- **THEN** all color properties transition smoothly over 300ms via CSS `transition` on `background-color`, `border-color`, and `color`

### Requirement: Color token naming convention
The design system SHALL use semantic color tokens (not palette names) so components reference intent rather than specific hues. Every color token MUST have both a light and dark value defined via CSS custom properties.

#### Scenario: Semantic token usage
- **WHEN** a component needs a background color
- **THEN** it references `var(--color-bg)` for the main background, `var(--color-surface)` for elevated surfaces, and `var(--color-accent)` for interactive highlights

#### Scenario: Token completeness
- **WHEN** the design system is fully defined
- **THEN** it includes at minimum: `--color-bg`, `--color-surface`, `--color-surface-hover`, `--color-border`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-success`, `--color-error`, `--color-warning`, `--color-user-bubble`, `--color-user-bubble-text`

### Requirement: Typography scale
The design system SHALL use Geist Sans as the primary proportional font for UI text and Geist Mono (or JetBrains Mono) for code. Inter MUST NOT be used as the default UI font. Serif fonts MUST NOT be introduced.

#### Scenario: Font family assignment
- **WHEN** text content is rendered
- **THEN** body text, labels, buttons, and all UI chrome use Geist Sans (with system sans-serif fallback), code blocks and inline code use Geist Mono or JetBrains Mono, and the message input uses the proportional font

#### Scenario: Size hierarchy
- **WHEN** text is displayed in the conversation view
- **THEN** assistant responses use `text-sm` (0.875rem) with `leading-relaxed` (1.625), user messages match the same size, tool cards use `text-xs` (0.75rem), and section headers use `text-base` (1rem) with appropriate weight

#### Scenario: Monospace containment
- **WHEN** monospace font is used
- **THEN** it is restricted to code blocks, inline code, tool names in tool cards, and file paths in the file picker — never for UI labels, button text, headings, or body copy

### Requirement: Flat component shape language
The design system SHALL use flat, ultra-minimalist component styling with `1px solid` borders as the primary visual separator. Heavy shadows and gradients MUST NOT be used. Border-radius MUST be consistent: 8px for cards and panels, 6px for buttons, 12px for message bubbles. `rounded-full` (pill shapes) MUST NOT be used for large containers, cards, or primary buttons.

#### Scenario: Card and bubble border radius
- **WHEN** a message bubble, card, dialog, or sidebar panel is rendered
- **THEN** it uses `border-radius: 12px` (message bubbles), `border-radius: 8px` (cards, dialogs, panels), and `border: 1px solid var(--color-border)` as the primary elevation cue — no box-shadow

#### Scenario: Surface distinction without shadows
- **WHEN** a surface needs to feel elevated above its background
- **THEN** it uses a `1px solid` border with the border color token, plus a slightly lighter/darker background fill — never a drop shadow, never a gradient

#### Scenario: Input field shape
- **WHEN** the message input field is rendered
- **THEN** it has `border-radius: 12px` with `border: 1px solid var(--color-border)`, a warm surface background, and a subtle accent border color change on focus — no glow, no shadow, no pill shape

#### Scenario: Button shape
- **WHEN** buttons are rendered
- **THEN** they use `border-radius: 6px` with no box-shadow, hover state uses a subtle background color shift or `transform: scale(0.98)` on active press

### Requirement: Subtle animation presets
The design system SHALL define CSS keyframe animations and transition utilities that feel invisible and quiet. Motion MUST NOT be spectacle. All animations MUST honor `prefers-reduced-motion`.

#### Scenario: Message entrance
- **WHEN** a new message appears in the conversation
- **THEN** it animates with `opacity: 0 → 1` and `translateY(12px → 0)` over 600ms using `cubic-bezier(0.16, 1, 0.3, 1)`, triggered via CSS class on mount

#### Scenario: Hover transitions
- **WHEN** a user hovers over an interactive element (button, card, sidebar item)
- **THEN** the background color or opacity transitions smoothly over 200ms

#### Scenario: Tool card expand
- **WHEN** a tool card's result or image section is toggled open
- **THEN** the content expands with a height/opacity transition over 200ms

#### Scenario: Reduced motion
- **WHEN** the user has `prefers-reduced-motion: reduce` enabled
- **THEN** all animations are disabled — elements appear instantly, transitions have zero duration

### Requirement: Spacing rhythm
The design system SHALL use consistent spacing values across all components with generous whitespace.

#### Scenario: Conversation spacing
- **WHEN** messages are displayed in the conversation view
- **THEN** the gap between consecutive messages is 1rem (16px), and the gap between different conversation turns is 1.5rem (24px)

#### Scenario: Component padding
- **WHEN** a card, dialog, or panel is rendered
- **THEN** internal padding is 16px for small components (tool cards) and 24px for larger panels (sidebar, dialogs)

#### Scenario: Section breathing room
- **WHEN** major sections of the UI are arranged vertically
- **THEN** each section is separated by generous whitespace — sidebar from main content by a `1px solid` border, input area from conversation by the same hairline

### Requirement: Dark mode warm tones
The dark mode variant SHALL use warm dark gray-brown tones rather than cold blue-gray tones. It MUST NOT use pure black (`#000000`) or pure white (`#ffffff`).

#### Scenario: Dark mode background
- **WHEN** dark mode is active
- **THEN** the background is a warm deep gray-brown (≈ `#1e1c19`), surfaces are slightly lighter (≈ `#282622`), borders are warm dark (≈ `#3a3732`), and the overall impression is warm and muted

#### Scenario: Dark mode contrast
- **WHEN** dark mode is active
- **THEN** text is a warm off-white (≈ `#e8e4dd`) with muted text at warm medium gray (≈ `#8a8580`), maintaining WCAG AA contrast ratios (4.5:1 for body text, 3:1 for large text)

### Requirement: Single accent consistency lock
The design system SHALL enforce exactly ONE accent color across the entire interface. All interactive states, focus indicators, links, and highlights MUST use this same accent token.

#### Scenario: Accent uniformity
- **WHEN** any interactive element is styled (button, link, focus ring, selection highlight, active tab, progress indicator)
- **THEN** it uses `var(--color-accent)` — no section, component, or panel introduces a different highlight color

#### Scenario: Accent in both themes
- **WHEN** the theme toggles between light and dark
- **THEN** the accent color adjusts its brightness/saturation slightly for contrast while remaining recognizably the same hue

### Requirement: Icon family consistency
The design system SHALL use exactly one icon family for the entire interface. Icons MUST come from a library (Phosphor, HugeIcons, Radix, or Tabler), never hand-rolled SVG paths.

#### Scenario: Icon rendering
- **WHEN** an icon is displayed (sidebar, buttons, status indicators, tool cards)
- **THEN** it uses the same icon family with consistent `strokeWidth` (1.5px or 2px) and the current text color token

### Requirement: Accent color token update

**Replaces**: The `--color-accent` token value in the existing warm design system.

The primary accent color token SHALL change from `#ca8a04` to `#b87503`. Dependent interactive tokens such as accent-hover and accent-bg SHALL use the new base hue. The user-message bubble SHALL remain a neutral surface so long messages do not read as warning or error states.

#### Scenario: CSS custom property values
- **WHEN** the `:root` styles are applied
- **THEN** `--color-accent` SHALL be `#b87503`
- **AND** `--color-accent-hover` SHALL be `#946002`
- **AND** `--color-accent-bg` SHALL be `rgba(184, 117, 3, 0.12)`
- **AND** `--color-accent-glow` SHALL be `rgba(184, 117, 3, 0.18)`
- **AND** `--color-user-bubble` SHALL be the neutral warm-gray `#ebe9e5`
- **AND** `--color-user-bubble-text` SHALL be `#2d2a26`

#### Scenario: Dark mode accent
- **WHEN** the `.dark` class is active
- **THEN** `--color-accent` SHALL shift to a lighter copper tone approximately `#c98605`
- **AND** `--color-user-bubble` SHALL be the neutral dark surface `#322e2a`
- **AND** `--color-user-bubble-text` SHALL be `#e8e4dd`

### Requirement: New spacing scale

The design system SHALL define a spacing scale with named tokens: `--space-xs` (4px), `--space-sm` (8px), `--space-md` (16px), `--space-lg` (24px), `--space-xl` (40px), `--space-2xl` (64px).

#### Scenario: Spacing tokens available
- **WHEN** any component references spacing
- **THEN** it SHALL use `var(--space-*)` tokens rather than hardcoded pixel values

### Requirement: Updated radius scale

The design system SHALL define a radius scale: `--radius-sm` (6px, buttons), `--radius-md` (10px, cards/panels), `--radius-lg` (16px, bubbles), `--radius-xl` (20px, input containers).

#### Scenario: Radius tokens available
- **WHEN** any component sets border-radius
- **THEN** it SHALL use `var(--radius-*)` tokens

### Requirement: Topbar height standardization

The design system SHALL standardize the topbar height to 38px via a `--topbar-h` token.

#### Scenario: Topbar height
- **WHEN** the topbar renders
- **THEN** it SHALL have `height: var(--topbar-h)` where `--topbar-h` is `38px`
