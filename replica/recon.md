# Recon map: Microsoft Word for the Web / Mobile (Local-First Cross-Device Slice)

Scope: Local-first Progressive Web App (PWA) word processor with Rich Text Editor (A4/Letter paginated view, Ribbon toolbar, headings, fonts, colors, tables, images, Undo/Redo, Find & Replace, Word Count), Document Management (Home, Folders, Search, Templates, Trash), and File Import/Export (`.docx`, `.pdf` / Print, `.html`, `.txt`, `.md`).
For: Personal, team, and internal organization document authoring across PC, Tablet, and Mobile without mandatory cloud login.
Date: 2026-11-26

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | Microsoft Word Help & Learning | https://support.microsoft.com/en-us/word | Complete reference of formatting, page setup, tables, find & replace, and export features |
| 2 | Word for the Web Service Description | https://learn.microsoft.com/en-us/office365/servicedescriptions/office-online-service-description/word-online | Public documentation of browser-based ribbon tabs (Home, Insert, Layout, View) and `.docx` fidelity boundaries |
| 3 | Microsoft Word Mobile Overview | https://www.microsoft.com/en-us/microsoft-365/word | Mobile Reading View vs. Print Layout, bottom formatting drawer on touch screens |
| 4 | ECMA-376 OpenXML Specification | https://ecma-international.org/publications-and-standards/standards/ecma-376/ | Public standard for `.docx` file structure (paragraphs, runs, tables, images, page margins) |

## Core loop

Open the app on any device -> pick a template or blank page (or import an existing `.docx`) -> write and format structured pages with instant local auto-save -> export a clean `.docx` or print-ready PDF.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Workspace Home & Templates | `/` (Home view) | Browse starter templates, search documents, filter by folder/pinned/recent, import `.docx`/`.txt`/`.html` | AppHeader, SidebarFolders, TemplateStrip, SearchBar, DocumentGrid/List, DropzoneModal | empty (no docs yet), loading (IndexedDB init), filled, search-no-results, mobile drawer |
| S02 | Document Editor (Print & Mobile Reflow) | `/doc/:id` (Editor view) | Write, format, paginate, inspect outline, count words, auto-save locally | TopDocumentBar, RibbonTabs (Home, Insert, Layout, View), PageCanvas (A4/Letter), OutlineSidebar, FindReplaceBar, MobileBottomToolbar, StatusBar | empty doc, editing, saving/saved indicator, read-only preview, focus mode, mobile reflow mode, print media |
| S03 | File & Export Drawer / Modal | Menu `File` in S02 | Document properties, page setup, export `.docx` / `.html` / `.txt` / `.md`, Print / Save PDF, Version snapshots | Modal/Drawer, FormatCards, PageSetupForm, SnapshotList | default, exporting progress, error (invalid file on import) |
| S04 | Table & Media Inspector | Insert tab / Contextual popover in S02 | Insert N x M table, add/remove rows & columns, insert local image with resize & alt text | GridPicker, ImageUploadDialog, TableContextBar | idle, selecting grid size, table focused, image focused |
| S05 | Folder & Trash Manager | Sidebar links in S01 | Organize documents into custom folders, restore or permanently delete trashed docs | FolderDialog, ConfirmDeleteModal, DocRowActions | empty trash, populated trash, folder rename |

## Flows

```
F01 Create document from blank or template & format
    S01 Home -> click Blank or Template -> S02 Editor -> type & format with Ribbon -> auto-saved to IndexedDB
    happy path clicks: 2
    edge: offline mode, storage quota warning, very long title (80+ chars), mobile virtual keyboard viewport resize

F02 Import an existing .docx / .html / .txt file
    S01 Home (or S03 File menu) -> click Import / drag file -> parse into clean HTML document -> S02 Editor
    happy path clicks: 2
    edge: corrupted file, unsupported binary (.doc legacy), large embedded images, empty file

F03 Export document to .docx, Print/PDF, HTML, or Plain Text
    S02 Editor -> S03 Export menu -> pick .docx (or Print/PDF) -> browser downloads clean file
    happy path clicks: 3
    edge: empty document export, Thai + English mixed typography, tables & images inside .docx, print page breaks

F04 Organize documents with Folders, Pinning, Search & Trash
    S01 Home -> create Folder -> move doc to Folder -> search keyword -> move to Trash -> restore from Trash
    happy path clicks: 3
    edge: deleting a folder with docs inside (docs move to All, not lost), search with Thai characters, empty search match

F05 Find & Replace + Document Outline navigation + Word Count
    S02 Editor -> press Ctrl+F / click Find -> enter query -> replace one/all -> jump to Heading in Outline
    happy path clicks: 3
    edge: regex special chars in query, case sensitivity, zero matches, replacing across multiple paragraphs
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, toolbar-icon, danger | default, hover, active/pressed, focus-visible, disabled, loading | all |
| RibbonBar | desktop tabbed ribbon (Home, Insert, Layout, View), compact single-row, mobile bottom sticky bar | tab switching, active format highlight (bold/italic/align/list), overflow scroll | S02 |
| PageCanvas | A4 Portrait, A4 Landscape, US Letter, Mobile Reflow | zoom 75%-150%, page-break guides, ruler ticks, print stylesheet | S02 |
| DocumentCard | grid card with mini page preview, list row | default, hover, pinned badge, context menu open | S01, S05 |
|OutlineDrawer | left/right collapsible heading tree (H1-H3) | empty ("Add headings to see outline"), populated, active section | S02 |
| FindReplaceBar | floating bar in editor | find-only, find-and-replace expanded, 0 matches, N of M matches | S02 |
| TableGridPicker | interactive up to 8x8 hover grid + custom dialog | hover cell highlight, keyboard arrow selection | S02, S04 |
| Modal / Drawer | desktop centered modal, mobile bottom sheet | open, closing, focus-trapped, Esc to close | S01, S03, S04, S05 |
| Toast | info, success, error | entering, visible, dismissed | all |

## Inferred data model

```
Document     id (uuid), title, content_html, plain_text, folder_id (nullable),
             is_pinned (bool), is_trashed (bool), page_size ('A4' | 'Letter'),
             orientation ('portrait' | 'landscape'), margins ('normal' | 'narrow' | 'wide'),
             font_family, zoom (int), word_count (int), created_at, updated_at
             evidence: S01 document list metadata, S02 page setup & status bar, S03 properties
             confidence: high

Folder       id (uuid), name, color_tag, sort_order, created_at, updated_at
             evidence: S01 sidebar organization
             confidence: high

Snapshot     id (uuid), document_id, title, content_html, word_count, created_at
             evidence: S03 local version history / restore points
             confidence: high

Template     id (slug), name, category, description, page_size, initial_html
             evidence: S01 starter template gallery (Blank, Business Letter, Meeting Notes, Project Proposal, Thai Official Memo)
             confidence: high
```

Relationships: `Folder 1-n Document (on delete set null)`, `Document 1-n Snapshot (on delete cascade)`. Stored locally in IndexedDB (`slatepress_db`) so every device works 100% offline with zero sign-up.

## Feature matrix

See `replica/features.csv`. Must: 19, should: 9, could: 3, skip: 4.

## Out of scope (cannot or should not be cloned)

- **Proprietary Microsoft fonts (Calibri, Aptos, Cambria, Segoe UI)** — licensed fonts; replaced with open Google Fonts supporting Thai & Latin (`Sarabun`, `Inter`, `Source Serif 4`, `JetBrains Mono`, `IBM Plex Sans Thai`).
- **OneDrive / SharePoint / Microsoft 365 Graph integration** — user requested local-first zero-login cross-device operation via browser IndexedDB + `.docx` import/export.
- **VBA Macros (`.docm`) & COM Add-in Store** — proprietary desktop scripting runtime and third-party marketplace.
- **Real-time multi-user cloud co-authoring** — scoped out per user selection for v1 local-first architecture.

## Size

Screens: 5, Flows: 5, Entities: 4. Hard parts: accurate client-side `.docx` import & export (paragraphs, headings, bold/italic/underline, colors, alignments, lists, tables, images), responsive Ribbon -> Mobile touch bar adaptation, clean A4/Letter pagination + CSS `@media print` PDF output, full Thai + English typography. Size: **M** (well-scoped local-first web app + PWA).
