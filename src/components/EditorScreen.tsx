import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Placeholder from '@tiptap/extension-placeholder';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Bold,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Code,
  Columns,
  Download,
  Eraser,
  Eye,
  FileCode2,
  FileDown,
  FileSpreadsheet,
  FileText,
  History,
  Highlighter,
  ImagePlus,
  Italic,
  LayoutTemplate,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Maximize2,
  Minus,
  Moon,
  Palette,
  Plus,
  Printer,
  Quote,
  Redo2,
  Rows,
  Ruler,
  Search,
  Smartphone,
  Sparkles,
  SplitSquareVertical,
  Strikethrough,
  Subscript as SubscriptIcon,
  Sun,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { DocumentRecord, PageMargin, PageOrientation, PageSize, SnapshotRecord } from '../types';
import { FontSizeExtension, PageBreakNode, ResizableImageExtension } from '../lib/editorExtensions';
import { computeTextMetrics, formatRelativeDate } from '../lib/metrics';
import { createSnapshot, listSnapshots } from '../lib/storage';
import {
  exportDocumentAsDocx,
  exportDocumentAsHtml,
  exportDocumentAsMarkdown,
  exportDocumentAsTxt,
  importDocumentFile,
} from '../lib/io';

interface EditorScreenProps {
  document: DocumentRecord;
  onBackHome: () => void;
  onSavePatch: (patch: Partial<DocumentRecord>) => Promise<void>;
  onSwitchDocument: (docId: string) => void;
  notify: (msg: string) => void;
}

type RibbonTab = 'home' | 'insert' | 'layout' | 'view';

interface OutlineHeading {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  index: number;
}

const FONT_FAMILIES = [
  { label: 'Sarabun (สารบรรณ)', value: 'Sarabun' },
  { label: 'IBM Plex Sans Thai', value: 'IBM Plex Sans Thai' },
  { label: 'Inter (สากล)', value: 'Inter' },
  { label: 'Source Serif 4 (มีเชิง)', value: 'Source Serif 4' },
  { label: 'JetBrains Mono (โค้ด)', value: 'JetBrains Mono' },
];

const FONT_SIZES = ['10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '20pt', '24pt', '28pt', '36pt'];

export const EditorScreen: React.FC<EditorScreenProps> = ({
  document: docRecord,
  onBackHome,
  onSavePatch,
  onSwitchDocument,
  notify,
}) => {
  const [title, setTitle] = useState(docRecord.title);
  const [activeTab, setActiveTab] = useState<RibbonTab>('home');
  const [subbarExpanded, setSubbarExpanded] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  // Page & Layout state
  const [pageSize, setPageSize] = useState<PageSize>(docRecord.pageSize);
  const [orientation, setOrientation] = useState<PageOrientation>(docRecord.orientation);
  const [margins, setMargins] = useState<PageMargin>(docRecord.margins);
  const [defaultFont, setDefaultFont] = useState<string>(docRecord.defaultFont || 'Sarabun');
  const [lineSpacing, setLineSpacing] = useState<string>(docRecord.lineSpacing || '1.5');
  const [headerText, setHeaderText] = useState<string>(
    docRecord.headerText ?? (docRecord.title === 'เอกสารไม่มีชื่อ' ? '' : docRecord.title),
  );
  const [showPageNumbers, setShowPageNumbers] = useState<boolean>(
    docRecord.showPageNumbers ?? true,
  );

  // View state (mobileReflow defaults to false so phones see the FULL scaled paper sheet!)
  const [zoom, setZoom] = useState<number>(100);
  const [mobileReflow, setMobileReflow] = useState<boolean>(false);
  const [viewportWidth, setViewportWidth] = useState<number>(() => window.innerWidth);
  const [naturalSheetHeight, setNaturalSheetHeight] = useState<number>(1123);
  const [showOutline, setShowOutline] = useState<boolean>(() => window.innerWidth >= 1200);
  const [showRuler, setShowRuler] = useState<boolean>(true);
  const [darkCanvas, setDarkCanvas] = useState<boolean>(false);
  const [readOnlyMode, setReadOnlyMode] = useState<boolean>(false);
  const [isDraggingOverSheet, setIsDraggingOverSheet] = useState<boolean>(false);

  // Modals & Popovers
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageAltInput, setImageAltInput] = useState('');
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<SnapshotRecord[]>([]);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('https://');

  // Find & Replace
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [matchCount, setMatchCount] = useState(0);

  // Live metrics & outline
  const [liveHtml, setLiveHtml] = useState(docRecord.contentHtml);
  const [, setSelectionTick] = useState(0);

  const saveTimerRef = useRef<number | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const sheetElementRef = useRef<HTMLDivElement>(null);

  const scheduleSave = useCallback(
    (patch: Partial<DocumentRecord>) => {
      setSaveStatus('saving');
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(async () => {
        await onSavePatch(patch);
        setSaveStatus('saved');
      }, 380);
    },
    [onSavePatch],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      FontFamily,
      FontSizeExtension,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      ResizableImageExtension.configure({
        allowBase64: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      PageBreakNode,
      Placeholder.configure({
        placeholder: 'เริ่มพิมพ์เนื้อหา หรือวางรูปภาพลงบนกระดาษได้เลย...',
      }),
    ],
    content: docRecord.contentHtml || '<p></p>',
    editable: !readOnlyMode,
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      setLiveHtml(html);
      scheduleSave({ contentHtml: html });
    },
    onSelectionUpdate: () => {
      setSelectionTick((t) => t + 1);
    },
  });

  const insertImageFiles = useCallback(
    (files: FileList | File[]) => {
      if (!editor) return;
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      if (imageFiles.length === 0) return;

      imageFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            editor
              .chain()
              .focus()
              .setImage({
                src: reader.result,
                alt: imageAltInput.trim() || file.name,
              })
              .run();
          }
        };
        reader.readAsDataURL(file);
      });

      setImageModalOpen(false);
      setImageAltInput('');
      notify(
        imageFiles.length > 1
          ? `แทรกรูปภาพ ${imageFiles.length} รูปเรียบร้อยแล้ว`
          : 'แทรกรูปภาพลงในกระดาษเรียบร้อยแล้ว',
      );
    },
    [editor, imageAltInput, notify],
  );

  // Sync if user switches document from File > Import
  useEffect(() => {
    setTitle(docRecord.title);
    setPageSize(docRecord.pageSize);
    setOrientation(docRecord.orientation);
    setMargins(docRecord.margins);
    setDefaultFont(docRecord.defaultFont || 'Sarabun');
    setLineSpacing(docRecord.lineSpacing || '1.5');
    setHeaderText(
      docRecord.headerText ?? (docRecord.title === 'เอกสารไม่มีชื่อ' ? '' : docRecord.title),
    );
    setShowPageNumbers(docRecord.showPageNumbers ?? true);
    setLiveHtml(docRecord.contentHtml);
    if (editor && editor.getHTML() !== docRecord.contentHtml) {
      editor.commands.setContent(docRecord.contentHtml || '<p></p>');
    }
  }, [docRecord.id, editor]);

  // Track window width & sheet height so mobile/tablet scales the entire paper sheet cleanly into view!
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const el = sheetElementRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setNaturalSheetHeight(Math.ceil(entry.target.scrollHeight || entry.contentRect.height));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [liveHtml, pageSize, orientation, margins, mobileReflow]);

  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnlyMode);
    }
  }, [readOnlyMode, editor]);

  // Keyboard shortcuts for Ctrl+F (Find) and Ctrl+S (Instant Save)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setFindOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (editor) {
          onSavePatch({ title, contentHtml: editor.getHTML() }).then(() => {
            setSaveStatus('saved');
            notify('บันทึกเอกสารลงในเครื่องแล้ว');
          });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, notify, onSavePatch, title]);

  // Compute match count for Find
  useEffect(() => {
    if (!findQuery.trim()) {
      setMatchCount(0);
      return;
    }
    const parsed = new DOMParser().parseFromString(liveHtml, 'text/html');
    const plain = (parsed.body.textContent || '').toLowerCase();
    const needle = findQuery.toLowerCase();
    let count = 0;
    let pos = plain.indexOf(needle);
    while (pos !== -1) {
      count += 1;
      pos = plain.indexOf(needle, pos + needle.length);
    }
    setMatchCount(count);
  }, [findQuery, liveHtml]);

  const metrics = useMemo(() => computeTextMetrics(liveHtml), [liveHtml]);

  const outlineHeadings = useMemo<OutlineHeading[]>(() => {
    const parsed = new DOMParser().parseFromString(liveHtml, 'text/html');
    const els = Array.from(parsed.body.querySelectorAll('h1, h2, h3'));
    return els
      .map((el, index) => ({
        id: `heading-${index}`,
        level: Number(el.tagName.slice(1)) as 1 | 2 | 3,
        text: (el.textContent || '').trim() || '(หัวข้อว่าง)',
        index,
      }))
      .filter((h) => h.text.length > 0);
  }, [liveHtml]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleSave({ title: val.trim() || 'เอกสารไม่มีชื่อ' });
  };

  const handleLayoutChange = async (patch: {
    pageSize?: PageSize;
    orientation?: PageOrientation;
    margins?: PageMargin;
    defaultFont?: string;
    lineSpacing?: string;
  }) => {
    if (patch.pageSize) setPageSize(patch.pageSize);
    if (patch.orientation) setOrientation(patch.orientation);
    if (patch.margins) setMargins(patch.margins);
    if (patch.defaultFont) setDefaultFont(patch.defaultFont);
    if (patch.lineSpacing) setLineSpacing(patch.lineSpacing);
    await onSavePatch(patch);
  };

  const handleImagePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      insertImageFiles(files);
    }
    e.target.value = '';
  };

  const handleInsertImageByUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editor || !imageUrlInput.trim()) return;
    editor
      .chain()
      .focus()
      .setImage({
        src: imageUrlInput.trim(),
        alt: imageAltInput.trim() || 'รูปภาพประกอบเอกสาร',
      })
      .run();
    setImageUrlInput('');
    setImageAltInput('');
    setImageModalOpen(false);
    notify('แทรกรูปภาพจากลิงก์เรียบร้อยแล้ว');
  };

  const updateSelectedImageAttrs = (attrs: {
    width?: number;
    align?: 'left' | 'center' | 'right';
    rounded?: boolean;
  }) => {
    if (!editor) return;
    editor.chain().focus().updateAttributes('image', attrs).run();
  };

  const handleReplaceAll = () => {
    if (!editor || !findQuery) return;
    const needle = findQuery.toLowerCase();
    const matches: Array<{ from: number; to: number }> = [];

    editor.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      const lower = node.text.toLowerCase();
      let idx = lower.indexOf(needle);
      while (idx !== -1) {
        matches.push({ from: pos + idx, to: pos + idx + findQuery.length });
        idx = lower.indexOf(needle, idx + findQuery.length);
      }
    });

    if (matches.length === 0) {
      notify('ไม่พบคำที่ต้องการแทนที่');
      return;
    }

    const tr = editor.state.tr;
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const { from, to } = matches[i];
      if (replaceQuery) {
        tr.insertText(replaceQuery, from, to);
      } else {
        tr.delete(from, to);
      }
    }
    editor.view.dispatch(tr);
    const nextHtml = editor.getHTML();
    setLiveHtml(nextHtml);
    scheduleSave({ contentHtml: nextHtml });
    notify(`แทนที่คำสำเร็จ ${matches.length} จุด`);
  };

  const openSnapshotsModal = async () => {
    const list = await listSnapshots(docRecord.id);
    setSnapshots(list);
    setSnapshotModalOpen(true);
  };

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editor) {
      await onSavePatch({ title, contentHtml: editor.getHTML() });
    }
    await createSnapshot(docRecord.id, snapshotLabel);
    setSnapshotLabel('');
    const list = await listSnapshots(docRecord.id);
    setSnapshots(list);
    notify('บันทึกเวอร์ชันย้อนหลังแล้ว');
  };

  const handleRestoreSnapshot = async (snap: SnapshotRecord) => {
    if (!editor) return;
    editor.commands.setContent(snap.contentHtml);
    setLiveHtml(snap.contentHtml);
    await onSavePatch({ contentHtml: snap.contentHtml });
    setSnapshotModalOpen(false);
    notify(`ย้อนกลับไปยัง "${snap.label}" แล้ว`);
  };

  const jumpToHeading = (headingIndex: number) => {
    const container = sheetContainerRef.current;
    if (!container) return;
    const domHeadings = container.querySelectorAll('.tiptap h1, .tiptap h2, .tiptap h3');
    const target = domHeadings[headingIndex];
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (window.innerWidth < 900) {
      setShowOutline(false);
    }
  };

  const activeBlockStyle = useMemo(() => {
    if (!editor) return 'p';
    if (editor.isActive('heading', { level: 1 })) return 'h1';
    if (editor.isActive('heading', { level: 2 })) return 'h2';
    if (editor.isActive('heading', { level: 3 })) return 'h3';
    if (editor.isActive('blockquote')) return 'blockquote';
    return 'p';
  }, [editor, liveHtml]);

  const applyBlockStyle = (val: string) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (val === 'p') chain.setParagraph().run();
    else if (val === 'h1') chain.toggleHeading({ level: 1 }).run();
    else if (val === 'h2') chain.toggleHeading({ level: 2 }).run();
    else if (val === 'h3') chain.toggleHeading({ level: 3 }).run();
    else if (val === 'blockquote') chain.toggleBlockquote().run();
  };

  const handleHeaderTextChange = (val: string) => {
    setHeaderText(val);
    scheduleSave({ headerText: val });
  };

  const currentDocSnapshot = (): DocumentRecord => ({
    ...docRecord,
    title: title.trim() || 'เอกสารไม่มีชื่อ',
    contentHtml: editor ? editor.getHTML() : liveHtml,
    headerText,
    showPageNumbers,
    pageSize,
    orientation,
    margins,
    defaultFont,
    lineSpacing,
    wordCount: metrics.words,
  });

  const sheetPixelWidth =
    orientation === 'landscape'
      ? pageSize === 'Letter'
        ? 1056
        : 1123
      : pageSize === 'Letter'
        ? 816
        : 794;

  // Compute auto-fit scale so phones (e.g. 390px) see the ENTIRE paper sheet edge-to-edge cleanly!
  const availableCanvasWidth = Math.max(280, viewportWidth - (viewportWidth < 768 ? 20 : 48));
  const autoFitScale = Math.min(1, availableCanvasWidth / sheetPixelWidth);
  const effectiveScale = mobileReflow ? 1 : autoFitScale * (zoom / 100);

  // Escape header text for CSS custom property content string (exact match with Sheet 1 header!)
  const escapedCssHeaderLabel = headerText.trim()
    ? `"${headerText.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    : '""';
  const escapedCssPageNumPrefix = showPageNumbers ? '"หน้า "' : '""';

  const sheetSizeClass = `fw-sheet--${pageSize.toLowerCase()}-${orientation}`;
  const sheetMarginClass = `fw-sheet--margin-${margins}`;
  const currentImgAttrs = editor?.isActive('image') ? editor.getAttributes('image') : null;

  return (
    <div className={`fw-editor-shell ${darkCanvas ? 'fw-editor-shell--dark-canvas' : ''}`}>
      {/* Hidden shared image input for 1-click or modal image picking */}
      <input
        id="input-editor-image"
        ref={imageInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleImagePicked}
      />

      {/* Minimal Airy Top Document Bar */}
      <header className="fw-doc-topbar">
        <div className="fw-doc-topbar__left">
          <button
            id="btn-back-home"
            type="button"
            className="fw-btn fw-btn--secondary fw-btn--sm"
            onClick={async () => {
              if (editor) {
                await onSavePatch({
                  title: title.trim() || 'เอกสารไม่มีชื่อ',
                  contentHtml: editor.getHTML(),
                });
              }
              onBackHome();
            }}
            title="กลับหน้าหลักเอกสารทั้งหมด"
          >
            <ArrowLeft size={16} />
            <span className="fw-desktop-only">หน้าหลัก</span>
          </button>

          <input
            id="input-doc-title"
            type="text"
            className="fw-doc-title-input"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            aria-label="ชื่อเอกสาร"
          />

          <span className="fw-save-pill fw-desktop-only" aria-live="polite">
            <Check size={13} color="var(--color-success)" />
            {saveStatus === 'saving' ? 'กำลังบันทึก...' : 'บันทึกแล้ว'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            id="btn-mobile-reflow-toggle"
            type="button"
            className={`fw-tool-btn ${!mobileReflow ? 'fw-tool-btn--active' : ''}`}
            onClick={() => setMobileReflow((v) => !v)}
            title={
              mobileReflow
                ? 'กำลังใช้โหมดขยายตัวหนังสือ — แตะเพื่อดูเต็มแผ่นกระดาษ'
                : 'กำลังดูเต็มแผ่นกระดาษ — แตะเพื่อสลับโหมดขยายตัวหนังสือ'
            }
          >
            <Smartphone size={15} />
            <span>{mobileReflow ? 'โหมดอ่าน' : 'เต็มแผ่น'}</span>
          </button>

          <button
            id="btn-open-snapshots"
            type="button"
            className="fw-tool-btn fw-desktop-only"
            onClick={openSnapshotsModal}
            title="ประวัติเวอร์ชันย้อนหลัง"
          >
            <History size={15} />
            <span>เวอร์ชัน</span>
          </button>

          <button
            id="btn-print-pdf"
            type="button"
            className="fw-btn fw-btn--secondary fw-btn--sm fw-desktop-only"
            onClick={() => window.print()}
            title="พิมพ์หรือบันทึกเป็น PDF"
          >
            <Printer size={15} />
            พิมพ์ / PDF
          </button>

          <button
            id="btn-file-export"
            type="button"
            className="fw-btn fw-btn--primary fw-btn--sm"
            onClick={() => setFileModalOpen(true)}
          >
            <Download size={15} />
            ไฟล์ / ส่งออก
          </button>
        </div>
      </header>

      {/* Main Editor Workspace Body */}
      <div className="fw-editor-body">
        {showOutline && (
          <aside className="fw-outline-pane" aria-label="สารบัญเอกสาร">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 6,
                padding: '0 4px',
              }}
            >
              <strong
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                }}
              >
                สารบัญหัวข้อ ({outlineHeadings.length})
              </strong>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setShowOutline(false)}
                aria-label="ปิดสารบัญ"
              >
                <X size={14} />
              </button>
            </div>

            {outlineHeadings.length === 0 ? (
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  margin: '4px 6px',
                  lineHeight: 1.5,
                }}
              >
                กำหนดข้อความเป็น หัวข้อ 1, 2 หรือ 3 เพื่อสร้างสารบัญนำทางอัตโนมัติ
              </p>
            ) : (
              outlineHeadings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  className={`fw-outline-item fw-outline-item--h${h.level}`}
                  onClick={() => jumpToHeading(h.index)}
                >
                  {h.text}
                </button>
              ))
            )}
          </aside>
        )}

        {findOpen && (
          <div className="fw-find-bar" role="dialog" aria-label="ค้นหาและแทนที่">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <strong style={{ fontSize: 'var(--text-xs)' }}>
                ค้นหาและแทนที่คำ ({matchCount} จุด)
              </strong>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setFindOpen(false)}
                aria-label="ปิดหน้าต่างค้นหา"
              >
                <X size={15} />
              </button>
            </div>
            <input
              id="input-find-query"
              type="text"
              className="fw-input"
              placeholder="คำที่ต้องการค้นหา..."
              value={findQuery}
              onChange={(e) => setFindQuery(e.target.value)}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="input-replace-query"
                type="text"
                className="fw-input"
                style={{ flex: 1 }}
                placeholder="แทนที่ด้วย..."
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
              />
              <button
                id="btn-replace-all"
                type="button"
                className="fw-btn fw-btn--primary fw-btn--sm"
                style={{ height: 38 }}
                onClick={handleReplaceAll}
              >
                แทนที่ทั้งหมด
              </button>
            </div>
          </div>
        )}

        {/* Canvas Column: Floating Pill Toolbar right above the Paper + Scrollable Paper */}
        <div className="fw-canvas-column">
          {/* FLOATING FROSTED-GLASS CAPSULE DOCK RIGHT ABOVE THE PAPER */}
          <div className="fw-paper-dock" role="region" aria-label="แถบเครื่องมือลอยเหนือกระดาษ">
            {/* Tier 1: Primary Frosted Capsule (matches IMG_0761.jpeg) */}
            <div className="fw-capsule-primary" role="tablist" aria-label="หมวดเครื่องมือหลัก">
              <button
                id="ribbon-tab-home"
                role="tab"
                aria-selected={activeTab === 'home'}
                type="button"
                className={`fw-capsule-tab ${activeTab === 'home' ? 'fw-capsule-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab('home');
                  setSubbarExpanded(true);
                }}
              >
                <Type size={16} />
                <span>หน้าแรก</span>
              </button>

              <button
                id="ribbon-tab-insert"
                role="tab"
                aria-selected={activeTab === 'insert'}
                type="button"
                className={`fw-capsule-tab ${activeTab === 'insert' ? 'fw-capsule-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab('insert');
                  setSubbarExpanded(true);
                }}
              >
                <Plus size={16} />
                <span>แทรก</span>
              </button>

              {/* Center Featured "+ รูปภาพ" Action right on the Floating Dock */}
              <button
                id="btn-quick-image"
                type="button"
                className="fw-capsule-plus-img"
                onClick={() => setImageModalOpen(true)}
                title="แทรกรูปภาพจากเครื่องหรือลิงก์"
              >
                <ImagePlus size={16} />
                <span>รูปภาพ</span>
              </button>

              <button
                id="ribbon-tab-layout"
                role="tab"
                aria-selected={activeTab === 'layout'}
                type="button"
                className={`fw-capsule-tab ${activeTab === 'layout' ? 'fw-capsule-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab('layout');
                  setSubbarExpanded(true);
                }}
              >
                <LayoutTemplate size={16} />
                <span>เค้าโครงหน้า</span>
              </button>

              <button
                id="ribbon-tab-view"
                role="tab"
                aria-selected={activeTab === 'view'}
                type="button"
                className={`fw-capsule-tab ${activeTab === 'view' ? 'fw-capsule-tab--active' : ''}`}
                onClick={() => {
                  setActiveTab('view');
                  setSubbarExpanded(true);
                }}
              >
                <Eye size={16} />
                <span>มุมมอง</span>
              </button>

              <div className="fw-capsule-divider" aria-hidden="true" />

              <button
                id="btn-undo"
                type="button"
                className="fw-tool-btn"
                onClick={() => editor?.chain().focus().undo().run()}
                disabled={!editor?.can().undo()}
                title="เลิกทำ (Ctrl+Z)"
                aria-label="เลิกทำ"
              >
                <Undo2 size={15} />
              </button>
              <button
                id="btn-redo"
                type="button"
                className="fw-tool-btn"
                onClick={() => editor?.chain().focus().redo().run()}
                disabled={!editor?.can().redo()}
                title="ทำซ้ำ (Ctrl+Y)"
                aria-label="ทำซ้ำ"
              >
                <Redo2 size={15} />
              </button>
              <button
                id="btn-find-toggle"
                type="button"
                className={`fw-tool-btn ${findOpen ? 'fw-tool-btn--active' : ''}`}
                onClick={() => setFindOpen((v) => !v)}
                title="ค้นหาและแทนที่ (Ctrl+F)"
              >
                <Search size={15} />
                <span className="fw-desktop-only">ค้นหา</span>
              </button>
              <button
                id="btn-toggle-subbar"
                type="button"
                className="fw-tool-btn"
                onClick={() => setSubbarExpanded((v) => !v)}
                title={subbarExpanded ? 'ซ่อนแถบเครื่องมือย่อย' : 'แสดงแถบเครื่องมือย่อย'}
                aria-label={subbarExpanded ? 'ซ่อนแถบเครื่องมือย่อย' : 'แสดงแถบเครื่องมือย่อย'}
              >
                {subbarExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>

            {/* Tier 2: Contextual Floating Glass Formatting Pill */}
            {subbarExpanded && (
              <div className="fw-capsule-tools">
                {activeTab === 'home' && editor && (
                  <>
                    <div className="fw-tool-group">
                      <select
                        id="select-block-style"
                        aria-label="รูปแบบหัวข้อ"
                        className="fw-ribbon-select"
                        value={activeBlockStyle}
                        onChange={(e) => applyBlockStyle(e.target.value)}
                      >
                        <option value="p">ข้อความปกติ</option>
                        <option value="h1">หัวข้อหลัก 1 (H1)</option>
                        <option value="h2">หัวข้อรอง 2 (H2)</option>
                        <option value="h3">หัวข้อย่อย 3 (H3)</option>
                        <option value="blockquote">กล่องคำพูดเน้น</option>
                      </select>

                      <select
                        id="select-font-family"
                        aria-label="แบบอักษร"
                        className="fw-ribbon-select"
                        value={editor.getAttributes('textStyle').fontFamily || defaultFont}
                        onChange={(e) => {
                          const f = e.target.value;
                          editor.chain().focus().setFontFamily(f).run();
                        }}
                      >
                        {FONT_FAMILIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <select
                        id="select-font-size"
                        aria-label="ขนาดอักษร"
                        className="fw-ribbon-select"
                        value={editor.getAttributes('textStyle').fontSize || '12pt'}
                        onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
                      >
                        {FONT_SIZES.map((sz) => (
                          <option key={sz} value={sz}>
                            {sz}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fw-tool-group">
                      <button
                        id="btn-bold"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('bold') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        title="ตัวหนา (Ctrl+B)"
                        aria-label="ตัวหนา"
                      >
                        <Bold size={15} />
                      </button>
                      <button
                        id="btn-italic"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('italic') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                        title="ตัวเอียง (Ctrl+I)"
                        aria-label="ตัวเอียง"
                      >
                        <Italic size={15} />
                      </button>
                      <button
                        id="btn-underline"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('underline') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                        title="ขีดเส้นใต้ (Ctrl+U)"
                        aria-label="ขีดเส้นใต้"
                      >
                        <UnderlineIcon size={15} />
                      </button>
                      <button
                        id="btn-strike"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('strike') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                        title="ขีดฆ่าข้อความ"
                        aria-label="ขีดฆ่าข้อความ"
                      >
                        <Strikethrough size={15} />
                      </button>
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('subscript') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleSubscript().run()}
                        title="ตัวห้อย"
                        aria-label="ตัวห้อย"
                      >
                        <SubscriptIcon size={15} />
                      </button>
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('superscript') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleSuperscript().run()}
                        title="ตัวยก"
                        aria-label="ตัวยก"
                      >
                        <SuperscriptIcon size={15} />
                      </button>
                    </div>

                    <div className="fw-tool-group">
                      <label className="fw-color-swatch-label" title="สีตัวอักษร">
                        <Palette size={14} />
                        <input
                          type="color"
                          className="fw-color-input"
                          aria-label="สีตัวอักษร"
                          value={editor.getAttributes('textStyle').color || '#1d221f'}
                          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
                        />
                      </label>

                      <label className="fw-color-swatch-label" title="สีเน้นข้อความ (Highlight)">
                        <Highlighter size={14} />
                        <input
                          type="color"
                          className="fw-color-input"
                          aria-label="สีไฮไลต์"
                          defaultValue="#fff3a3"
                          onChange={(e) =>
                            editor.chain().focus().toggleHighlight({ color: e.target.value }).run()
                          }
                        />
                      </label>

                      <button
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                        title="ล้างการจัดรูปแบบ"
                        aria-label="ล้างการจัดรูปแบบ"
                      >
                        <Eraser size={15} />
                      </button>
                    </div>

                    <div className="fw-tool-group">
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive({ textAlign: 'left' }) ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                        title="ชิดซ้าย"
                        aria-label="ชิดซ้าย"
                      >
                        <AlignLeft size={15} />
                      </button>
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive({ textAlign: 'center' }) ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                        title="กึ่งกลาง"
                        aria-label="กึ่งกลาง"
                      >
                        <AlignCenter size={15} />
                      </button>
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive({ textAlign: 'right' }) ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                        title="ชิดขวา"
                        aria-label="ชิดขวา"
                      >
                        <AlignRight size={15} />
                      </button>
                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive({ textAlign: 'justify' }) ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                        title="กระจายเท่ากันสองข้าง"
                        aria-label="กระจายเท่ากัน"
                      >
                        <AlignJustify size={15} />
                      </button>
                    </div>

                    <div className="fw-tool-group">
                      <button
                        id="btn-bullet-list"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('bulletList') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                        title="รายการสัญลักษณ์"
                        aria-label="รายการสัญลักษณ์"
                      >
                        <List size={15} />
                      </button>
                      <button
                        id="btn-ordered-list"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('orderedList') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                        title="รายการลำดับตัวเลข"
                        aria-label="รายการลำดับตัวเลข"
                      >
                        <ListOrdered size={15} />
                      </button>
                      <button
                        id="btn-task-list"
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('taskList') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleTaskList().run()}
                        title="รายการเช็กลิสต์"
                        aria-label="รายการเช็กลิสต์"
                      >
                        <CheckSquare size={15} />
                      </button>
                    </div>
                  </>
                )}

                {activeTab === 'insert' && editor && (
                  <>
                    <div className="fw-tool-group">
                      <button
                        id="btn-insert-image"
                        type="button"
                        className="fw-tool-btn fw-tool-btn--active"
                        onClick={() => setImageModalOpen(true)}
                      >
                        <ImagePlus size={15} />
                        แทรกรูปภาพ
                      </button>

                      <button
                        id="btn-insert-table"
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => setTableModalOpen(true)}
                      >
                        <TableIcon size={15} />
                        แทรกตาราง
                      </button>

                      {editor.isActive('table') && (
                        <>
                          <button
                            type="button"
                            className="fw-tool-btn"
                            onClick={() => editor.chain().focus().addRowAfter().run()}
                          >
                            <Rows size={14} /> +แถว
                          </button>
                          <button
                            type="button"
                            className="fw-tool-btn"
                            onClick={() => editor.chain().focus().addColumnAfter().run()}
                          >
                            <Columns size={14} /> +คอลัมน์
                          </button>
                          <button
                            type="button"
                            className="fw-tool-btn"
                            onClick={() => editor.chain().focus().deleteRow().run()}
                          >
                            ลบแถว
                          </button>
                          <button
                            type="button"
                            className="fw-tool-btn"
                            onClick={() => editor.chain().focus().deleteColumn().run()}
                          >
                            ลบคอลัมน์
                          </button>
                          <button
                            type="button"
                            className="fw-tool-btn"
                            style={{ color: 'var(--color-danger)' }}
                            onClick={() => editor.chain().focus().deleteTable().run()}
                          >
                            <Trash2 size={14} /> ลบตาราง
                          </button>
                        </>
                      )}
                    </div>

                    <div className="fw-tool-group">
                      <button
                        id="btn-insert-link"
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => {
                          const prev = editor.getAttributes('link').href || 'https://';
                          setLinkUrl(prev);
                          setLinkModalOpen(true);
                        }}
                      >
                        <Link2 size={15} />
                        แทรกลิงก์
                      </button>

                      <button
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                      >
                        <Minus size={15} />
                        เส้นคั่น
                      </button>

                      <button
                        id="btn-insert-pagebreak"
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => editor.chain().focus().insertPageBreak().run()}
                      >
                        <SplitSquareVertical size={15} />
                        ขึ้นหน้าใหม่
                      </button>

                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('blockquote') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleBlockquote().run()}
                      >
                        <Quote size={15} />
                        คำพูดอ้างอิง
                      </button>

                      <button
                        type="button"
                        className={`fw-tool-btn ${editor.isActive('codeBlock') ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                      >
                        <Code size={15} />
                        บล็อกโค้ด
                      </button>
                    </div>
                  </>
                )}

                {activeTab === 'layout' && (
                  <>
                    <div className="fw-tool-group">
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '0 6px' }}>
                        ขนาดหน้า:
                      </span>
                      <select
                        id="select-page-size"
                        aria-label="ขนาดหน้ากระดาษ"
                        className="fw-ribbon-select"
                        value={pageSize}
                        onChange={(e) => handleLayoutChange({ pageSize: e.target.value as PageSize })}
                      >
                        <option value="A4">A4 (210 × 297 มม.)</option>
                        <option value="Letter">US Letter (8.5 × 11 นิ้ว)</option>
                      </select>

                      <select
                        id="select-orientation"
                        aria-label="แนวกระดาษ"
                        className="fw-ribbon-select"
                        value={orientation}
                        onChange={(e) =>
                          handleLayoutChange({ orientation: e.target.value as PageOrientation })
                        }
                      >
                        <option value="portrait">แนวตั้ง (Portrait)</option>
                        <option value="landscape">แนวนอน (Landscape)</option>
                      </select>
                    </div>

                    <div className="fw-tool-group">
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '0 6px' }}>
                        ระยะขอบ:
                      </span>
                      <select
                        id="select-margins"
                        aria-label="ระยะขอบกระดาษ"
                        className="fw-ribbon-select"
                        value={margins}
                        onChange={(e) => handleLayoutChange({ margins: e.target.value as PageMargin })}
                      >
                        <option value="normal">มาตรฐาน (2.54 ซม.)</option>
                        <option value="narrow">แคบ (1.27 ซม.)</option>
                        <option value="wide">กว้าง (3.81 ซม.)</option>
                      </select>
                    </div>

                    <div className="fw-tool-group">
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '0 6px' }}>
                        ฟอนต์หลัก:
                      </span>
                      <select
                        aria-label="ฟอนต์เริ่มต้นของเอกสาร"
                        className="fw-ribbon-select"
                        value={defaultFont}
                        onChange={(e) => handleLayoutChange({ defaultFont: e.target.value })}
                      >
                        {FONT_FAMILIES.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.label}
                          </option>
                        ))}
                      </select>

                      <select
                        aria-label="ระยะห่างบรรทัด"
                        className="fw-ribbon-select"
                        value={lineSpacing}
                        onChange={(e) => handleLayoutChange({ lineSpacing: e.target.value })}
                      >
                        <option value="1.25">บรรทัด 1.25</option>
                        <option value="1.5">บรรทัด 1.5</option>
                        <option value="1.75">บรรทัด 1.75</option>
                        <option value="2">บรรทัด 2.0</option>
                      </select>
                    </div>

                    <div className="fw-tool-group">
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)', padding: '0 6px' }}>
                        หัวกระดาษซ้ำทุกแผ่น:
                      </span>
                      <input
                        id="input-layout-header"
                        type="text"
                        className="fw-input"
                        style={{ height: 32, width: 190, fontSize: 12, borderRadius: 999 }}
                        placeholder="เช่น บันทึกข้อความ / ชื่อหน่วยงาน"
                        value={headerText}
                        onChange={(e) => handleHeaderTextChange(e.target.value)}
                      />
                      <button
                        id="btn-toggle-pagenum"
                        type="button"
                        className={`fw-tool-btn ${showPageNumbers ? 'fw-tool-btn--active' : ''}`}
                        onClick={async () => {
                          const next = !showPageNumbers;
                          setShowPageNumbers(next);
                          await onSavePatch({ showPageNumbers: next });
                        }}
                      >
                        เลขหน้าอัตโนมัติ
                      </button>
                    </div>
                  </>
                )}

                {activeTab === 'view' && (
                  <>
                    <div className="fw-tool-group">
                      <button
                        id="btn-toggle-outline"
                        type="button"
                        className={`fw-tool-btn ${showOutline ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => setShowOutline((v) => !v)}
                      >
                        <ListTree size={15} />
                        สารบัญหัวข้อ
                      </button>

                      <button
                        type="button"
                        className={`fw-tool-btn ${showRuler ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => setShowRuler((v) => !v)}
                      >
                        <Ruler size={15} />
                        ไม้บรรทัด
                      </button>

                      <button
                        type="button"
                        className={`fw-tool-btn ${mobileReflow ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => setMobileReflow((v) => !v)}
                      >
                        <Smartphone size={15} />
                        โหมดพอดีจอ
                      </button>
                    </div>

                    <div className="fw-tool-group">
                      <button
                        type="button"
                        className={`fw-tool-btn ${readOnlyMode ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => setReadOnlyMode((v) => !v)}
                      >
                        <Eye size={15} />
                        อ่านอย่างเดียว
                      </button>

                      <button
                        type="button"
                        className={`fw-tool-btn ${darkCanvas ? 'fw-tool-btn--active' : ''}`}
                        onClick={() => setDarkCanvas((v) => !v)}
                      >
                        {darkCanvas ? <Sun size={15} /> : <Moon size={15} />}
                        พักสายตา
                      </button>
                    </div>

                    <div className="fw-tool-group">
                      <button
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => setZoom((z) => Math.max(70, z - 10))}
                        aria-label="ย่อหน้ากระดาษ"
                      >
                        <ZoomOut size={15} />
                      </button>
                      <span
                        style={{
                          fontSize: 12,
                          minWidth: 44,
                          textAlign: 'center',
                          fontWeight: 600,
                        }}
                      >
                        {zoom}%
                      </span>
                      <button
                        type="button"
                        className="fw-tool-btn"
                        onClick={() => setZoom((z) => Math.min(150, z + 10))}
                        aria-label="ขยายหน้ากระดาษ"
                      >
                        <ZoomIn size={15} />
                      </button>
                      <button type="button" className="fw-tool-btn" onClick={() => setZoom(100)}>
                        <Maximize2 size={14} /> 100%
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Tier 3: Contextual Floating Image Inspector Pill when an image is clicked */}
            {editor && currentImgAttrs && (
              <div className="fw-image-inspector-pill" role="toolbar" aria-label="ปรับแต่งรูปภาพ">
                <span style={{ opacity: 0.75, padding: '0 4px', fontWeight: 600 }}>รูปภาพ:</span>
                <button
                  id="btn-img-size-sm"
                  type="button"
                  className={`fw-tool-btn ${Number(currentImgAttrs.width) === 220 ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ width: 220 })}
                >
                  เล็ก
                </button>
                <button
                  id="btn-img-size-md"
                  type="button"
                  className={`fw-tool-btn ${Number(currentImgAttrs.width) === 380 ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ width: 380 })}
                >
                  กลาง
                </button>
                <button
                  id="btn-img-size-lg"
                  type="button"
                  className={`fw-tool-btn ${Number(currentImgAttrs.width) === 520 ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ width: 520 })}
                >
                  ใหญ่
                </button>
                <button
                  id="btn-img-size-full"
                  type="button"
                  className={`fw-tool-btn ${Number(currentImgAttrs.width) === 640 ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ width: 640 })}
                >
                  เต็มหน้า
                </button>

                <span style={{ opacity: 0.35 }}>|</span>

                <button
                  id="btn-img-align-left"
                  type="button"
                  className={`fw-tool-btn ${currentImgAttrs.align === 'left' ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ align: 'left' })}
                  title="จัดรูปชิดซ้าย"
                >
                  <AlignLeft size={14} />
                </button>
                <button
                  id="btn-img-align-center"
                  type="button"
                  className={`fw-tool-btn ${(currentImgAttrs.align || 'center') === 'center' ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ align: 'center' })}
                  title="จัดรูปกึ่งกลาง"
                >
                  <AlignCenter size={14} />
                </button>
                <button
                  id="btn-img-align-right"
                  type="button"
                  className={`fw-tool-btn ${currentImgAttrs.align === 'right' ? 'fw-tool-btn--active' : ''}`}
                  onClick={() => updateSelectedImageAttrs({ align: 'right' })}
                  title="จัดรูปชิดขวา"
                >
                  <AlignRight size={14} />
                </button>

                <span style={{ opacity: 0.35 }}>|</span>

                <button
                  type="button"
                  className={`fw-tool-btn ${currentImgAttrs.rounded !== false ? 'fw-tool-btn--active' : ''}`}
                  onClick={() =>
                    updateSelectedImageAttrs({ rounded: currentImgAttrs.rounded === false })
                  }
                  title="สลับขอบรูปมนละมุน"
                >
                  <Sparkles size={13} /> ขอบมน
                </button>

                <button
                  id="btn-img-delete"
                  type="button"
                  className="fw-tool-btn"
                  style={{ color: '#ff9494' }}
                  onClick={() => editor.chain().focus().deleteSelection().run()}
                  title="ลบรูปภาพนี้"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </div>

          <div className="fw-canvas-scroll" ref={sheetContainerRef}>
            {/* Optional Soft Pill Ruler right above the Paper */}
          {showRuler && !mobileReflow && (
            <div className="fw-ruler fw-desktop-only" aria-hidden="true">
              <div
                className="fw-ruler__track"
                style={{
                  width: orientation === 'landscape' ? 1123 : pageSize === 'Letter' ? 816 : 794,
                }}
              >
                {Array.from({ length: 19 }, (_, idx) => (
                  <span key={idx}>{idx + 1}</span>
                ))}
              </div>
            </div>
          )}

          {/* Paper Sheet (auto-scales to show FULL sheet edge-to-edge on mobile + supports Repeating Header!) */}
          <div
            className="fw-sheet-zoom-wrapper"
            style={
              mobileReflow
                ? {
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                  }
                : {
                    width: `${Math.round(sheetPixelWidth * effectiveScale)}px`,
                    height: `${Math.round(naturalSheetHeight * effectiveScale)}px`,
                    position: 'relative',
                  }
            }
          >
            <div
              ref={sheetElementRef}
              className={`fw-sheet fw-prose ${
                mobileReflow ? 'fw-sheet--reflow' : `${sheetSizeClass} ${sheetMarginClass}`
              } ${isDraggingOverSheet ? 'fw-sheet--dragover' : ''}`}
              style={
                {
                  fontFamily: `'${defaultFont}', 'Sarabun', 'Inter', sans-serif`,
                  lineHeight: lineSpacing,
                  transform: mobileReflow ? 'none' : `scale(${effectiveScale})`,
                  transformOrigin: 'top left',
                  '--doc-header-label': escapedCssHeaderLabel,
                  '--doc-pagenum-prefix': escapedCssPageNumPrefix,
                } as React.CSSProperties
              }
              onClick={(e) => {
                if (!readOnlyMode && !(e.target instanceof HTMLInputElement)) {
                  editor?.commands.focus();
                }
              }}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer.types).includes('Files')) {
                  e.preventDefault();
                  setIsDraggingOverSheet(true);
                }
              }}
              onDragLeave={() => setIsDraggingOverSheet(false)}
              onDrop={(e) => {
                setIsDraggingOverSheet(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  const hasImages = Array.from(e.dataTransfer.files).some((f) =>
                    f.type.startsWith('image/'),
                  );
                  if (hasImages) {
                    e.preventDefault();
                    insertImageFiles(e.dataTransfer.files);
                  }
                }
              }}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const pastedImages: File[] = [];
                for (const item of Array.from(items)) {
                  if (item.type.startsWith('image/')) {
                    const f = item.getAsFile();
                    if (f) pastedImages.push(f);
                  }
                }
                if (pastedImages.length > 0) {
                  e.preventDefault();
                  insertImageFiles(pastedImages);
                }
              }}
            >
              {/* Print-only fixed running header that repeats on every printed / PDF page */}
              {(headerText.trim() || showPageNumbers) && (
                <div className="fw-print-running-header" aria-hidden="true">
                  <span>{headerText.trim()}</span>
                  <span>{title}</span>
                </div>
              )}

              {/* Editable Running Header on Sheet 1 (mirrored automatically on every Page Break!) */}
              <div
                className="fw-running-header"
                onClick={(e) => e.stopPropagation()}
                role="region"
                aria-label="หัวกระดาษประจำทุกหน้า"
              >
                <input
                  id="input-running-header"
                  type="text"
                  className="fw-running-header__input"
                  value={headerText}
                  onChange={(e) => handleHeaderTextChange(e.target.value)}
                  placeholder="คลิกพิมพ์หัวกระดาษ (จะแสดงซ้ำอัตโนมัติเมื่อขึ้นหน้าใหม่ทุกแผ่น)..."
                  aria-label="ข้อความหัวกระดาษ"
                />
                {showPageNumbers && <span className="fw-running-header__pagenum">หน้า 1</span>}
              </div>

              <EditorContent editor={editor} />
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* Mobile Floating Frosted Capsule Quick-Format Bar */}
      {editor && !readOnlyMode && (
        <div className="fw-mobile-bar-wrap">
          <div className="fw-mobile-bar" role="toolbar" aria-label="แถบเครื่องมือด่วนบนมือถือ">
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('bold') ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleBold().run()}
              aria-label="ตัวหนา"
            >
              <Bold size={17} />
            </button>
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('italic') ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              aria-label="ตัวเอียง"
            >
              <Italic size={17} />
            </button>
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('underline') ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              aria-label="ขีดเส้นใต้"
            >
              <UnderlineIcon size={17} />
            </button>
            <button
              type="button"
              className="fw-capsule-plus-img"
              style={{ height: 34, padding: '0 12px' }}
              onClick={() => setImageModalOpen(true)}
              aria-label="แทรกรูปภาพ"
            >
              <ImagePlus size={16} />
            </button>
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('heading', { level: 1 }) ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            >
              H1
            </button>
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('heading', { level: 2 }) ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              H2
            </button>
            <button
              type="button"
              className={`fw-tool-btn ${editor.isActive('bulletList') ? 'fw-tool-btn--active' : ''}`}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              aria-label="รายการสัญลักษณ์"
            >
              <List size={17} />
            </button>
            <button
              type="button"
              className="fw-tool-btn"
              onClick={() => setTableModalOpen(true)}
              aria-label="แทรกตาราง"
            >
              <TableIcon size={17} />
            </button>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <footer className="fw-statusbar">
        <div className="fw-statusbar__group">
          <button
            id="btn-word-count-stats"
            type="button"
            className="fw-btn fw-btn--ghost fw-btn--sm"
            style={{ height: 26, padding: '0 10px' }}
            onClick={() => setStatsModalOpen(true)}
          >
            <span>{metrics.words.toLocaleString()} คำ</span>
            <span>•</span>
            <span>{metrics.characters.toLocaleString()} ตัวอักษร</span>
            <span className="fw-desktop-only">• ประมาณ {metrics.estimatedPages} หน้า</span>
          </button>
        </div>

        <div className="fw-statusbar__group">
          <span className="fw-desktop-only">
            {mobileReflow
              ? 'มุมมองพอดีจออุปกรณ์'
              : `${pageSize} ${orientation === 'portrait' ? 'แนวตั้ง' : 'แนวนอน'}`}
          </span>
          <span className="fw-desktop-only">• อ่าน ~{metrics.readingMinutes} นาที</span>
        </div>
      </footer>

      {/* S04: Rich Image Insert Modal (Upload / Drag-Drop / URL) */}
      {imageModalOpen && (
        <div className="fw-modal-backdrop" onClick={() => setImageModalOpen(false)}>
          <div
            className="fw-modal"
            style={{ maxWidth: 460 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-image-title"
          >
            <div className="fw-modal__header">
              <h2 id="modal-image-title" className="fw-modal__title">
                แทรกรูปภาพลงในเอกสาร
              </h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setImageModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div
              id="btn-pick-device-image"
              className="fw-image-dropzone"
              role="button"
              tabIndex={0}
              onClick={() => imageInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  imageInputRef.current?.click();
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) {
                  insertImageFiles(e.dataTransfer.files);
                }
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 999,
                  background: 'var(--color-bg)',
                  color: 'var(--color-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <ImagePlus size={24} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-base)' }}>
                แตะเพื่อเลือกรูปจากเครื่อง / คลังภาพมือถือ
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                หรือลากไฟล์ภาพมาวางบนกระดาษ หรือกด Ctrl+V เพื่อวางภาพแคปหน้าจอได้ทันที
              </div>
            </div>

            <form
              onSubmit={handleInsertImageByUrl}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                borderTop: '1px solid var(--color-border-soft)',
                paddingTop: 14,
              }}
            >
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                หรือแทรกรูปจากลิงก์ (Image URL)
              </div>
              <input
                id="input-image-url"
                type="url"
                className="fw-input"
                placeholder="https://example.com/photo.jpg"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
              />
              <input
                id="input-image-alt"
                type="text"
                className="fw-input"
                placeholder="คำอธิบายรูปภาพ (ไม่บังคับ)"
                value={imageAltInput}
                onChange={(e) => setImageAltInput(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="fw-btn fw-btn--secondary"
                  onClick={() => setImageModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  id="btn-insert-image-url"
                  type="submit"
                  className="fw-btn fw-btn--primary"
                  disabled={!imageUrlInput.trim()}
                >
                  แทรกรูปจากลิงก์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* S03: File & Export Modal */}
      {fileModalOpen && (
        <div className="fw-modal-backdrop" onClick={() => setFileModalOpen(false)}>
          <div
            className="fw-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-export-title"
          >
            <div className="fw-modal__header">
              <h2 id="modal-export-title" className="fw-modal__title">
                ไฟล์ การส่งออก และตั้งค่าเอกสาร
              </h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setFileModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
              ส่งออกเอกสาร <strong>"{title}"</strong> ไปใช้งานต่อในรูปแบบมาตรฐาน
            </div>

            <div className="fw-export-grid">
              <button
                id="btn-export-docx"
                type="button"
                className="fw-export-card"
                onClick={async () => {
                  await exportDocumentAsDocx(currentDocSnapshot());
                  setFileModalOpen(false);
                  notify('ส่งออกไฟล์ .docx เรียบร้อยแล้ว');
                }}
              >
                <FileDown size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    เอกสาร OpenXML (.docx)
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    เก็บหัวข้อ ฟอนต์ สี ตาราง และรูปภาพครบถ้วน
                  </div>
                </div>
              </button>

              <button
                id="btn-export-pdf-print"
                type="button"
                className="fw-export-card"
                onClick={() => {
                  setFileModalOpen(false);
                  setTimeout(() => window.print(), 150);
                }}
              >
                <Printer size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    พิมพ์ / บันทึกเป็น PDF
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    คมชัดระดับเวกเตอร์ รองรับสระและวรรณยุกต์ไทย 100%
                  </div>
                </div>
              </button>

              <button
                id="btn-export-html"
                type="button"
                className="fw-export-card"
                onClick={() => {
                  exportDocumentAsHtml(currentDocSnapshot());
                  setFileModalOpen(false);
                  notify('ส่งออกไฟล์ .html เรียบร้อยแล้ว');
                }}
              >
                <FileCode2 size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>เว็บเพจ (.html)</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    ไฟล์เดี่ยวเปิดอ่านได้ในทุกเบราว์เซอร์
                  </div>
                </div>
              </button>

              <button
                id="btn-export-md"
                type="button"
                className="fw-export-card"
                onClick={() => {
                  exportDocumentAsMarkdown(currentDocSnapshot());
                  setFileModalOpen(false);
                  notify('ส่งออกไฟล์ .md เรียบร้อยแล้ว');
                }}
              >
                <FileSpreadsheet size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>Markdown (.md)</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    สำหรับระบบเอกสารนักพัฒนาและคลังความรู้
                  </div>
                </div>
              </button>

              <button
                id="btn-export-txt"
                type="button"
                className="fw-export-card"
                onClick={() => {
                  exportDocumentAsTxt(currentDocSnapshot());
                  setFileModalOpen(false);
                  notify('ส่งออกไฟล์ข้อความล้วน (.txt) แล้ว');
                }}
              >
                <FileText size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    ข้อความล้วน (.txt)
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    เฉพาะเนื้อหาข้อความไม่มีโค้ดจัดรูปแบบ
                  </div>
                </div>
              </button>

              <button
                id="btn-modal-open-file"
                type="button"
                className="fw-export-card"
                onClick={() => importFileInputRef.current?.click()}
              >
                <Upload size={22} color="var(--color-accent)" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)' }}>
                    เปิด / แปลงไฟล์ PDF & .docx
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                    นำเข้า .pdf, .docx, .html, .txt หรือ .md มาแก้ไขต่อทันที
                  </div>
                </div>
              </button>
              <input
                ref={importFileInputRef}
                type="file"
                accept=".pdf,.docx,.html,.htm,.txt,.md,application/pdf"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  try {
                    if (f.name.toLowerCase().endsWith('.pdf')) {
                      notify('กำลังแปลงไฟล์ PDF ให้แก้ไขได้...');
                    }
                    const imported = await importDocumentFile(f, docRecord.folderId);
                    setFileModalOpen(false);
                    notify(`เปิดไฟล์ "${imported.title}" พร้อมแก้ไขแล้ว`);
                    onSwitchDocument(imported.id);
                  } catch (err) {
                    notify(err instanceof Error ? err.message : 'ไม่สามารถเปิดไฟล์ได้');
                  }
                }}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--color-border-soft)',
                paddingTop: 12,
              }}
            >
              <button
                type="button"
                className="fw-btn fw-btn--secondary fw-btn--sm"
                onClick={() => {
                  setFileModalOpen(false);
                  openSnapshotsModal();
                }}
              >
                <History size={15} />
                จัดการเวอร์ชันย้อนหลัง
              </button>
              <button
                type="button"
                className="fw-btn fw-btn--secondary"
                onClick={() => setFileModalOpen(false)}
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table Insert Modal */}
      {tableModalOpen && editor && (
        <div className="fw-modal-backdrop" onClick={() => setTableModalOpen(false)}>
          <div
            className="fw-modal"
            style={{ maxWidth: 380 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fw-modal__header">
              <h2 className="fw-modal__title">แทรกตาราง</h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setTableModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-sm)' }}>
                <span>จำนวนแถว</span>
                <input
                  id="input-table-rows"
                  type="number"
                  min={1}
                  max={20}
                  className="fw-input"
                  value={tableRows}
                  onChange={(e) => setTableRows(Math.max(1, Math.min(20, Number(e.target.value))))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--text-sm)' }}>
                <span>จำนวนคอลัมน์</span>
                <input
                  id="input-table-cols"
                  type="number"
                  min={1}
                  max={10}
                  className="fw-input"
                  value={tableCols}
                  onChange={(e) => setTableCols(Math.max(1, Math.min(10, Number(e.target.value))))}
                />
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="fw-btn fw-btn--secondary"
                onClick={() => setTableModalOpen(false)}
              >
                ยกเลิก
              </button>
              <button
                id="btn-confirm-insert-table"
                type="button"
                className="fw-btn fw-btn--primary"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .insertTable({ rows: tableRows, cols: tableCols, withHeaderRow: true })
                    .run();
                  setTableModalOpen(false);
                }}
              >
                แทรกตาราง ({tableRows} × {tableCols})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Link Insert Modal */}
      {linkModalOpen && editor && (
        <div className="fw-modal-backdrop" onClick={() => setLinkModalOpen(false)}>
          <div
            className="fw-modal"
            style={{ maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fw-modal__header">
              <h2 className="fw-modal__title">แทรกหรือแก้ไขลิงก์</h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setLinkModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <input
              type="url"
              className="fw-input"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="https://example.com"
              autoFocus
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button
                type="button"
                className="fw-btn fw-btn--danger-ghost"
                onClick={() => {
                  editor.chain().focus().unsetLink().run();
                  setLinkModalOpen(false);
                }}
              >
                ลบลิงก์ออก
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="fw-btn fw-btn--secondary"
                  onClick={() => setLinkModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  className="fw-btn fw-btn--primary"
                  onClick={() => {
                    if (linkUrl.trim()) {
                      editor
                        .chain()
                        .focus()
                        .extendMarkRange('link')
                        .setLink({ href: linkUrl.trim() })
                        .run();
                    }
                    setLinkModalOpen(false);
                  }}
                >
                  บันทึกลิงก์
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Local Version Snapshots Modal */}
      {snapshotModalOpen && (
        <div className="fw-modal-backdrop" onClick={() => setSnapshotModalOpen(false)}>
          <div
            className="fw-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fw-modal__header">
              <h2 className="fw-modal__title">ประวัติเวอร์ชันในเครื่อง (Snapshots)</h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setSnapshotModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSnapshot} style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                className="fw-input"
                style={{ flex: 1 }}
                placeholder="ตั้งชื่อจุดบันทึก เช่น ก่อนแก้บทที่ 2..."
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
              />
              <button type="submit" className="fw-btn fw-btn--primary">
                บันทึกจุดนี้ไว้
              </button>
            </form>

            {snapshots.length === 0 ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  color: 'var(--color-text-muted)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                ยังไม่มีจุดบันทึกเวอร์ชัน กดปุ่มด้านบนเพื่อเก็บสำเนาเอกสาร ณ จุดสำคัญไว้ย้อนกลับได้ตลอดเวลา
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {snapshots.map((snap) => (
                  <div
                    key={snap.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      border: '1px solid var(--color-border-soft)',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--color-bg)',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{snap.label}</div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                        {formatRelativeDate(snap.createdAt)} • {snap.wordCount.toLocaleString()} คำ
                      </div>
                    </div>
                    <button
                      type="button"
                      className="fw-btn fw-btn--secondary fw-btn--sm"
                      onClick={() => handleRestoreSnapshot(snap)}
                    >
                      ย้อนใช้เวอร์ชันนี้
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Word Count Detailed Stats Modal */}
      {statsModalOpen && (
        <div className="fw-modal-backdrop" onClick={() => setStatsModalOpen(false)}>
          <div
            className="fw-modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="fw-modal__header">
              <h2 className="fw-modal__title">สถิติจำนวนคำและเนื้อหา</h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setStatsModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 'var(--text-sm)' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-surface)',
                  paddingBottom: 6,
                }}
              >
                <span>จำนวนหน้าโดยประมาณ</span>
                <strong>{metrics.estimatedPages.toLocaleString()} หน้า</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-surface)',
                  paddingBottom: 6,
                }}
              >
                <span>จำนวนคำ (รองรับตัดคำไทย + อังกฤษ)</span>
                <strong>{metrics.words.toLocaleString()} คำ</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-surface)',
                  paddingBottom: 6,
                }}
              >
                <span>อักขระ (ไม่รวมช่องว่าง)</span>
                <strong>{metrics.charactersNoSpaces.toLocaleString()}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-surface)',
                  paddingBottom: 6,
                }}
              >
                <span>อักขระ (รวมช่องว่าง)</span>
                <strong>{metrics.characters.toLocaleString()}</strong>
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid var(--color-surface)',
                  paddingBottom: 6,
                }}
              >
                <span>ย่อหน้าและรายการ</span>
                <strong>{metrics.paragraphs.toLocaleString()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>เวลาอ่านโดยประมาณ</span>
                <strong>{metrics.readingMinutes} นาที</strong>
              </div>
            </div>
            <button
              type="button"
              className="fw-btn fw-btn--primary"
              onClick={() => setStatsModalOpen(false)}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
