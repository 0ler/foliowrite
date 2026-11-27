# Architecture: FolioWrite (a clean-room local-first cross-device rebuild of Microsoft Word's core authoring & document management flows)

## Stack

| layer | choice | why |
| --- | --- | --- |
| web & PWA | Vite + React 19 + TypeScript | Instant load, zero server dependency, installable PWA (`manifest.webmanifest` + Service Worker) that runs identically on Desktop, iPad/Tablet, and iOS/Android browsers |
| styling | Vanilla CSS + Design Tokens (`tokens.css`) | Full control over A4/Letter physical page layout, `@media print` pagination, responsive Ribbon-to-Mobile Bottom Bar adaptation, zero framework bloat |
| editor engine | Tiptap (ProseMirror) + custom extensions | Clean semantic document AST (Headings, FontFamily, FontSize, Color, Highlight, TextAlign, LineHeight, Subscript/Superscript, Tables with resizable/editable cells, Images, TaskList, Search/Replace) — far more reliable across mobile & desktop than raw `contenteditable` |
| local database | IndexedDB (`idb` wrapper) | Stores unlimited documents, embedded images, folders, and version snapshots locally on each device without 5 MB `localStorage` limits |
| `.docx` import | `mammoth` + custom HTML sanitizer | Converts real `.docx` OpenXML files into clean semantic HTML preserving headings, lists, tables, inline styles, and embedded base64 images |
| `.docx` export | `docx` (ECMA-376 OpenXML generator) | Walks the editor HTML/DOM tree to emit standards-compliant `.docx` files (paragraphs, text runs, bold/italic/underline/strike, colors, font sizes, alignments, bullet/numbered lists, tables, images, page size & margins) that open natively in desktop word processors |
| PDF / Print | Native CSS `@page` + `@media print` engine | Crisp vector text PDF export (supporting Thai vowel/tone marks without canvas rasterization bugs) + exact A4/Letter page margins |
| icons & fonts | `lucide-react` (MIT) + Google Fonts (`Inter`, `Sarabun`, `IBM Plex Sans Thai`, `Source Serif 4`, `JetBrains Mono`) | Open-licensed icons and full Thai + English typographic fidelity |

## Schema (Local IndexedDB: `foliowrite_db` v1)

Stores: 3 (`documents`, `folders`, `snapshots`). Access rules: 100% client-side origin-isolated storage on the user's device; zero telemetry or external network transfer of user documents.

```sql
-- Equivalent relational DDL for IndexedDB object stores & indexes
create table folders (
  id text primary key,
  name text not null,
  color text not null default '#0f766e',
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table documents (
  id text primary key,
  title text not null default 'เอกสารไม่มีชื่อ',
  content_html text not null default '<p></p>',
  plain_text text not null default '',
  folder_id text references folders(id) on delete set null,
  is_pinned boolean not null default false,
  is_trashed boolean not null default false,
  page_size text not null default 'A4' check (page_size in ('A4', 'Letter')),
  orientation text not null default 'portrait' check (orientation in ('portrait', 'landscape')),
  margins text not null default 'normal' check (margins in ('normal', 'narrow', 'wide')),
  default_font text not null default 'Sarabun',
  word_count integer not null default 0,
  created_at timestamptz not null,
  updated_at timestamptz not null
);
create index idx_documents_updated on documents (updated_at desc);
create index idx_documents_folder on documents (folder_id);
create index idx_documents_trashed on documents (is_trashed);

create table snapshots (
  id text primary key,
  document_id text not null references documents(id) on delete cascade,
  label text not null,
  content_html text not null,
  word_count integer not null default 0,
  created_at timestamptz not null
);
create index idx_snapshots_doc on snapshots (document_id, created_at desc);
```

## Local Data Layer API (`src/lib/storage.ts` & `src/lib/io.ts`)

| function | does | input | output | flow |
| --- | --- | --- | --- | --- |
| `listDocuments(filter)` | Lists documents filtered by folder, pinned, trashed, or search query | `{ folderId?, trashed?, pinned?, query? }` | `DocumentRecord[]` | F01, F04 |
| `createDocument(init)` | Creates blank or template-seeded document | `Partial<DocumentRecord>` | `DocumentRecord` | F01 |
| `updateDocument(id, patch)` | Debounced auto-save of HTML, plainText, wordCount, page setup | `id, Partial<DocumentRecord>` | `DocumentRecord` | F01 |
| `trashDocument(id)` / `restoreDocument(id)` / `deleteDocumentForever(id)` | Soft-delete to trash, restore, or purge with snapshots | `id` | `void` | F04 |
| `listFolders()` / `createFolder()` / `renameFolder()` / `deleteFolder()` | Folder CRUD; deleting folder moves docs to root (`folder_id = null`) | folder params | `FolderRecord` | F04 |
| `createSnapshot(docId, label)` / `listSnapshots(docId)` | Saves or lists point-in-time document checkpoints | `docId, label` | `SnapshotRecord` | F01 |
| `importFile(file)` | Parses `.docx`, `.html`, `.txt`, or `.md` into a new `DocumentRecord` | `File` | `DocumentRecord` | F02 |
| `exportDocx(doc)` | Serializes structured HTML + styles + tables + images into `.docx` Blob | `DocumentRecord` | `Blob` download | F03 |
| `exportHtml(doc)` / `exportTxt(doc)` / `exportMarkdown(doc)` | Exports clean standalone file formats | `DocumentRecord` | `Blob` download | F03 |
| `exportWorkspaceBackup()` / `importWorkspaceBackup(file)` | Full JSON backup of all folders & docs to move across devices easily | `File?` | `Blob` / count | F03, F04 |

## The parts that bite

- **Thai + Latin word counting**: Whitespace splitting undercounts Thai sentences because Thai has no spaces between words. Use `Intl.Segmenter('th', { granularity: 'word' })` with fallback so Thai and English word counts are both accurate.
- **Mobile screen width vs. A4 page width (210mm = 794px)**: Rendering a fixed 794px sheet on a 390px phone forces horizontal scrolling. Implement automatic **Mobile Reflow Mode** on screens `< 768px` (with a toggle to preview exact Print Layout scaled to fit) plus a sticky touch-friendly bottom formatting bar.
- **PDF Thai typography**: Canvas-based PDF libraries (`html2canvas` + `jsPDF`) frequently clip Thai floating vowels (`ิ ี ึ ื ั ่ ้ ๊ ๋`) and produce blurry raster images. Native CSS `@page` + `@media print` produces crisp vector text, selectable PDFs, exact A4/Letter dimensions, and zero broken Thai glyphs.
- **`.docx` round-trip fidelity**: Custom DOM-to-`docx` serializer walks block nodes (`h1`-`h3`, `p`, `blockquote`, `ul`, `ol`, `table`, `hr`, `img`) and inline marks (`strong`, `em`, `u`, `s`, `sub`, `sup`, `a`, inline color/highlight/fontSize) so exported `.docx` files retain formatting cleanly.
- **Auto-save race conditions**: Debounce saves at 400ms and flush immediately on `visibilitychange` / navigation back to Home so edits are never lost.

## Build order

1. **Design Tokens & Brand Identity (`replica-design` + `replica-brand`)**: Teal-slate editorial palette (`FolioWrite`), contrast-checked with `contrast.py`, zero Microsoft trade-dress colors or names.
2. **Data Layer & Seed Workspace**: IndexedDB stores, Thai/English templates, `.docx`/`.html`/`.txt`/`.md` import & export engines.
3. **Vertical Slice (`S01` <-> `S02`)**: Create doc -> edit with Tiptap -> auto-save -> return Home and search.
4. **Full Editor & Cross-Device Polish (`S02`, `S03`, `S04`, `S05`)**: Tabbed Ribbon (Home, Insert, Layout, View), Mobile Bottom Bar, Tables, Images, Find & Replace, Outline drawer, Snapshots, Print/PDF stylesheet, PWA manifest & Service Worker.
5. **Verification (`replica-test`, `replica-diff`, `replica-brand` sweep)**: Playwright E2E tests across desktop & mobile viewports, `parity.py` check, and `sweep.py` check.
