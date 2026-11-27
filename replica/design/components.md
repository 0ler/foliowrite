# Component Specifications (`replica-design`)

All components use CSS custom properties from `src/styles/tokens.css` (zero hard-coded hex values).

## 1. Button (`Button` / `.fw-btn`)
- **Variants**: `primary` (`--color-accent` / `--color-on-accent`), `secondary` (`--color-surface` + `--color-border`), `ghost` (transparent -> `--color-surface` on hover), `toolbar` (28px/32px square or compact icon+label with active `--color-accent-soft` state), `danger` (`--color-danger`)
- **Sizes**: `sm` (30px), `md` (36px), `lg` (44px, touch-friendly on mobile)
- **States**: `default`, `hover`, `active` (`aria-pressed="true"`), `focus-visible` (2px `--color-accent` ring), `disabled` (opacity 0.45)
- **Used on**: S01, S02, S03, S04, S05

## 2. RibbonBar (`.fw-ribbon`)
- **Variants**:
  - Desktop (`>= 768px`): Tabbed strip (`หน้าแรก / Home`, `แทรก / Insert`, `เค้าโครง / Layout`, `มุมมอง / View`) with grouped tool clusters separated by subtle vertical rules, plus persistent Undo/Redo & Export actions.
  - Mobile (`< 768px`): Compact top header + horizontally scrollable touch toolbar docked cleanly for thumb access (`min-height: 44px` hit targets).
- **States**: Active format reflection from current cursor selection (Bold, Italic, Underline, Strike, Heading level, Font family, Font size, Alignment, List type, Table context tools).
- **Used on**: S02

## 3. PageCanvas (`.fw-canvas` & `.fw-sheet`)
- **Variants**:
  - `A4 Portrait` (210mm x 297mm, `794px` width at 96 DPI, min-height `1123px`)
  - `A4 Landscape` (297mm x 210mm, `1123px` width, min-height `794px`)
  - `Letter Portrait` (8.5in x 11in, `816px` width, min-height `1056px`)
  - `Letter Landscape` (`1056px` width, min-height `816px`)
  - `Mobile Reflow` (100% fluid container width with comfortable 20px padding so mobile users never scroll horizontally while typing)
- **Margins**: `normal` (25.4mm / 96px), `narrow` (12.7mm / 48px), `wide` (38.1mm / 144px)
- **Visual Pagination**: Subtle horizontal page-guide ticks every page height + `@media print` exact page rules.
- **Used on**: S02

## 4. DocumentCard & ListRow (`.fw-doc-card`)
- **Variants**: Grid card (mini scaled paper preview + title + updated timestamp + word count + folder chip) and Compact table row.
- **States**: `default`, `hover`, `pinned`, `trashed`, context action menu open.
- **Used on**: S01, S05

## 5. OutlineDrawer (`.fw-outline`)
- **Purpose**: Live table of contents parsed from `h1`, `h2`, `h3` nodes in the editor; clicking smoothly scrolls the heading into view.
- **States**: `empty` (guidance prompt to add a heading), `populated`, `mobile-overlay`.
- **Used on**: S02

## 6. FindReplaceBar (`.fw-find-bar`)
- **Purpose**: Floating non-modal bar at top-right of canvas (`Ctrl/Cmd + F`). Highlights matches, cycles Next/Previous, and supports Replace / Replace All.
- **Used on**: S02

## 7. Modal / Sheet (`.fw-modal`)
- **Purpose**: Accessible dialog for Export/File properties (S03), Image & Link insertion (S04), Version Snapshots, Word Count breakdown, and Folder creation (S05). Renders as centered dialog on desktop and bottom sheet on mobile.
- **Used on**: S01, S02, S03, S04, S05
