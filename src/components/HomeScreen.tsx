import React, { useMemo, useRef, useState } from 'react';
import {
  Clock,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  LayoutGrid,
  List,
  Menu,
  Pin,
  PinOff,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { DocumentRecord, DocumentTemplate, FolderRecord } from '../types';
import { STARTER_TEMPLATES } from '../lib/templates';
import { formatRelativeDate } from '../lib/metrics';
import {
  downloadWorkspaceBackupJson,
  exportDocumentAsDocx,
  importDocumentFile,
  importWorkspaceBackupJson,
} from '../lib/io';

export type HomeFilter =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'trash' }
  | { kind: 'folder'; folderId: string };

interface HomeScreenProps {
  documents: DocumentRecord[];
  folders: FolderRecord[];
  onOpenDocument: (docId: string) => void;
  onCreateFromTemplate: (template: DocumentTemplate, folderId: string | null) => Promise<void>;
  onTogglePin: (doc: DocumentRecord) => Promise<void>;
  onMoveToTrash: (doc: DocumentRecord) => Promise<void>;
  onRestoreFromTrash: (doc: DocumentRecord) => Promise<void>;
  onDeleteForever: (doc: DocumentRecord) => Promise<void>;
  onEmptyTrash: () => Promise<void>;
  onDuplicate: (doc: DocumentRecord) => Promise<void>;
  onAssignFolder: (doc: DocumentRecord, folderId: string | null) => Promise<void>;
  onCreateFolder: (name: string, color: string) => Promise<void>;
  onDeleteFolder: (folderId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  notify: (msg: string) => void;
}

const FOLDER_COLORS = ['#0d6b5e', '#8f5600', '#176b3a', '#4c5853', '#b92525'];

export const HomeScreen: React.FC<HomeScreenProps> = ({
  documents,
  folders,
  onOpenDocument,
  onCreateFromTemplate,
  onTogglePin,
  onMoveToTrash,
  onRestoreFromTrash,
  onDeleteForever,
  onEmptyTrash,
  onDuplicate,
  onAssignFolder,
  onCreateFolder,
  onDeleteFolder,
  onRefresh,
  notify,
}) => {
  const [filter, setFilter] = useState<HomeFilter>({ kind: 'all' });
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[0]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const activeFolderId = filter.kind === 'folder' ? filter.folderId : null;

  const counts = useMemo(() => {
    const active = documents.filter((d) => !d.isTrashed);
    const pinned = active.filter((d) => d.isPinned);
    const trashed = documents.filter((d) => d.isTrashed);
    const byFolder: Record<string, number> = {};
    for (const d of active) {
      if (d.folderId) {
        byFolder[d.folderId] = (byFolder[d.folderId] || 0) + 1;
      }
    }
    return {
      all: active.length,
      pinned: pinned.length,
      trash: trashed.length,
      byFolder,
    };
  }, [documents]);

  const filteredDocs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filter.kind === 'trash') {
        if (!doc.isTrashed) return false;
      } else {
        if (doc.isTrashed) return false;
        if (filter.kind === 'pinned' && !doc.isPinned) return false;
        if (filter.kind === 'folder' && doc.folderId !== filter.folderId) return false;
      }

      if (q) {
        const matchTitle = doc.title.toLowerCase().includes(q);
        const matchBody = doc.plainText.toLowerCase().includes(q);
        return matchTitle || matchBody;
      }
      return true;
    });
  }, [documents, filter, searchQuery]);

  const currentHeading = useMemo(() => {
    if (filter.kind === 'all') return 'เอกสารทั้งหมด';
    if (filter.kind === 'pinned') return 'เอกสารที่ปักหมุดไว้';
    if (filter.kind === 'trash') return 'ถังขยะ';
    const found = folders.find((f) => f.id === filter.folderId);
    return found ? `โฟลเดอร์: ${found.name}` : 'เอกสาร';
  }, [filter, folders]);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const created = await importDocumentFile(file, activeFolderId);
      await onRefresh();
      notify(`นำเข้า "${created.title}" เรียบร้อยแล้ว`);
      onOpenDocument(created.id);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ไม่สามารถนำเข้าไฟล์นี้ได้');
    }
  };

  const handleBackupImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const count = await importWorkspaceBackupJson(file);
      await onRefresh();
      notify(`กู้คืนข้อมูลสำรองสำเร็จ (${count} เอกสาร)`);
    } catch (err) {
      notify(err instanceof Error ? err.message : 'ไฟล์สำรองข้อมูลไม่ถูกต้อง');
    }
  };

  const handleCreateFolderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await onCreateFolder(newFolderName.trim(), newFolderColor);
    setNewFolderName('');
    setFolderModalOpen(false);
    notify('สร้างโฟลเดอร์ใหม่แล้ว');
  };

  return (
    <div className="fw-home">
      {sidebarOpen && (
        <div
          className="fw-sidebar-scrim"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fw-sidebar ${sidebarOpen ? 'fw-sidebar--open' : ''}`}
        aria-label="เมนูนำทางหลัก"
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="fw-brand">
            <img src="/foliowrite-icon.svg" alt="โลโก้ FolioWrite" className="fw-brand__logo" />
            <div>
              <h1 className="fw-brand__title">FolioWrite</h1>
              <p className="fw-brand__subtitle">Local-First • ทุกอุปกรณ์</p>
            </div>
          </div>
          <button
            type="button"
            className="fw-btn fw-btn--ghost fw-btn--sm fw-mobile-only"
            onClick={() => setSidebarOpen(false)}
            aria-label="ปิดเมนู"
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            id="btn-new-blank-doc"
            type="button"
            className="fw-btn fw-btn--primary"
            style={{ width: '100%', justifyContent: 'center', height: 40 }}
            onClick={() => onCreateFromTemplate(STARTER_TEMPLATES[0], activeFolderId)}
          >
            <FilePlus2 size={17} />
            สร้างเอกสารใหม่
          </button>
          <button
            id="btn-import-doc"
            type="button"
            className="fw-btn fw-btn--secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={handleImportClick}
          >
            <Upload size={16} />
            นำเข้าไฟล์ (.docx / .txt)
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.html,.htm,.txt,.md"
            style={{ display: 'none' }}
            onChange={handleFileImport}
          />
        </div>

        <nav className="fw-nav-group" aria-label="มุมมองเอกสาร">
          <div className="fw-nav-label">พื้นที่ทำงาน</div>
          <button
            id="nav-all-docs"
            type="button"
            className={`fw-nav-item ${filter.kind === 'all' ? 'fw-nav-item--active' : ''}`}
            onClick={() => {
              setFilter({ kind: 'all' });
              setSidebarOpen(false);
            }}
          >
            <span className="fw-nav-item__left">
              <Clock size={16} />
              <span className="fw-nav-item__name">เอกสารทั้งหมด</span>
            </span>
            <span className="fw-badge">{counts.all}</span>
          </button>

          <button
            id="nav-pinned-docs"
            type="button"
            className={`fw-nav-item ${filter.kind === 'pinned' ? 'fw-nav-item--active' : ''}`}
            onClick={() => {
              setFilter({ kind: 'pinned' });
              setSidebarOpen(false);
            }}
          >
            <span className="fw-nav-item__left">
              <Pin size={16} />
              <span className="fw-nav-item__name">ปักหมุดไว้</span>
            </span>
            <span className="fw-badge">{counts.pinned}</span>
          </button>

          <button
            id="nav-trash-docs"
            type="button"
            className={`fw-nav-item ${filter.kind === 'trash' ? 'fw-nav-item--active' : ''}`}
            onClick={() => {
              setFilter({ kind: 'trash' });
              setSidebarOpen(false);
            }}
          >
            <span className="fw-nav-item__left">
              <Trash2 size={16} />
              <span className="fw-nav-item__name">ถังขยะ</span>
            </span>
            <span className="fw-badge">{counts.trash}</span>
          </button>
        </nav>

        <nav className="fw-nav-group" style={{ flex: 1 }} aria-label="โฟลเดอร์">
          <div className="fw-nav-label">
            <span>โฟลเดอร์</span>
            <button
              id="btn-open-folder-modal"
              type="button"
              className="fw-btn fw-btn--ghost fw-btn--sm"
              onClick={() => setFolderModalOpen(true)}
              title="สร้างโฟลเดอร์ใหม่"
            >
              <FolderPlus size={15} />
            </button>
          </div>
          {folders.map((folder) => {
            const isActive = filter.kind === 'folder' && filter.folderId === folder.id;
            return (
              <div
                key={folder.id}
                style={{ display: 'flex', alignItems: 'center', gap: 2 }}
              >
                <button
                  type="button"
                  className={`fw-nav-item ${isActive ? 'fw-nav-item--active' : ''}`}
                  onClick={() => {
                    setFilter({ kind: 'folder', folderId: folder.id });
                    setSidebarOpen(false);
                  }}
                >
                  <span className="fw-nav-item__left">
                    <span
                      className="fw-folder-dot"
                      style={{ backgroundColor: folder.color }}
                    />
                    <span className="fw-nav-item__name">{folder.name}</span>
                  </span>
                  <span className="fw-badge">{counts.byFolder[folder.id] || 0}</span>
                </button>
                {isActive && (
                  <button
                    type="button"
                    className="fw-btn fw-btn--danger-ghost fw-btn--sm"
                    title="ลบโฟลเดอร์ (เอกสารจะไม่หาย)"
                    onClick={async () => {
                      await onDeleteFolder(folder.id);
                      setFilter({ kind: 'all' });
                      notify(`ลบโฟลเดอร์ "${folder.name}" แล้ว`);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>
            ย้ายเครื่อง / สำรองข้อมูลทั้งหมด
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              id="btn-backup-export"
              type="button"
              className="fw-btn fw-btn--secondary fw-btn--sm"
              style={{ flex: 1 }}
              onClick={async () => {
                await downloadWorkspaceBackupJson();
                notify('ดาวน์โหลดไฟล์สำรองข้อมูล (.json) แล้ว');
              }}
            >
              <Download size={13} />
              สำรองไฟล์
            </button>
            <button
              id="btn-backup-import"
              type="button"
              className="fw-btn fw-btn--secondary fw-btn--sm"
              style={{ flex: 1 }}
              onClick={() => backupInputRef.current?.click()}
            >
              <Upload size={13} />
              กู้คืนไฟล์
            </button>
            <input
              ref={backupInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleBackupImport}
            />
          </div>
        </div>
      </aside>

      <main className="fw-home-main">
        <header className="fw-home-topbar">
          <button
            id="btn-mobile-menu"
            type="button"
            className="fw-btn fw-btn--secondary fw-btn--sm fw-mobile-only"
            onClick={() => setSidebarOpen(true)}
            aria-label="เปิดเมนูนำทาง"
          >
            <Menu size={18} />
          </button>

          <div className="fw-search-wrap">
            <Search size={16} className="fw-search-wrap__icon" />
            <input
              id="input-search-docs"
              type="search"
              className="fw-search-input"
              placeholder="ค้นหาชื่อเอกสารหรือข้อความข้างใน..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              id="btn-view-grid"
              type="button"
              className={`fw-tool-btn ${viewMode === 'grid' ? 'fw-tool-btn--active' : ''}`}
              onClick={() => setViewMode('grid')}
              aria-label="มุมมองการ์ด"
              title="มุมมองการ์ด"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              id="btn-view-list"
              type="button"
              className={`fw-tool-btn ${viewMode === 'list' ? 'fw-tool-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="มุมมองตารางรายการ"
              title="มุมมองรายการ"
            >
              <List size={16} />
            </button>
          </div>
        </header>

        <div className="fw-home-content">
          {filter.kind !== 'trash' && !searchQuery.trim() && (
            <section aria-labelledby="templates-heading">
              <div className="fw-section-header">
                <h2 id="templates-heading" className="fw-section-title">
                  เริ่มเอกสารใหม่จากแม่แบบ
                </h2>
              </div>
              <div className="fw-template-grid">
                {STARTER_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    id={`tpl-${tpl.id}`}
                    type="button"
                    className="fw-template-card"
                    onClick={() => onCreateFromTemplate(tpl, activeFolderId)}
                  >
                    {tpl.id === 'blank' ? (
                      <div className="fw-template-preview fw-template-preview--blank">
                        <FilePlus2 size={30} />
                      </div>
                    ) : (
                      <div className="fw-template-preview" aria-hidden="true">
                        <div className="fw-template-line fw-template-line--title" />
                        <div className="fw-template-line" style={{ width: '92%' }} />
                        <div className="fw-template-line" style={{ width: '84%' }} />
                        <div className="fw-template-line" style={{ width: '70%' }} />
                        <div
                          style={{
                            marginTop: 4,
                            height: 28,
                            border: '1px solid var(--color-border)',
                            borderRadius: 4,
                            background: 'var(--color-bg)',
                          }}
                        />
                      </div>
                    )}
                    <span className="fw-template-card__cat">{tpl.category}</span>
                    <span className="fw-template-card__name">{tpl.name}</span>
                    <span className="fw-template-card__desc">{tpl.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="documents-heading">
            <div className="fw-section-header">
              <h2 id="documents-heading" className="fw-section-title">
                {currentHeading} ({filteredDocs.length})
              </h2>
              {filter.kind === 'trash' && filteredDocs.length > 0 && (
                <button
                  id="btn-empty-trash"
                  type="button"
                  className="fw-btn fw-btn--danger fw-btn--sm"
                  onClick={onEmptyTrash}
                >
                  <Trash2 size={14} />
                  ล้างถังขยะทั้งหมด
                </button>
              )}
            </div>

            {filteredDocs.length === 0 ? (
              <div className="fw-empty-state">
                <FileText size={38} color="var(--color-text-muted)" />
                <div style={{ fontWeight: 600 }}>
                  {searchQuery.trim()
                    ? `ไม่พบเอกสารที่ตรงกับ "${searchQuery}"`
                    : filter.kind === 'trash'
                      ? 'ถังขยะว่างเปล่า'
                      : 'ยังไม่มีเอกสารในหมวดนี้'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {filter.kind === 'trash'
                    ? 'เอกสารที่คุณลบจะถูกพักไว้ที่นี่เผื่อต้องการกู้คืน'
                    : 'กดสร้างเอกสารใหม่ หรือนำเข้าไฟล์ .docx จากเครื่องของคุณได้เลย'}
                </div>
                {filter.kind !== 'trash' && (
                  <button
                    type="button"
                    className="fw-btn fw-btn--primary"
                    onClick={() => onCreateFromTemplate(STARTER_TEMPLATES[0], activeFolderId)}
                  >
                    <FilePlus2 size={16} />
                    สร้างเอกสารเปล่า
                  </button>
                )}
              </div>
            ) : viewMode === 'grid' ? (
              <div className="fw-doc-grid">
                {filteredDocs.map((doc) => {
                  const folder = folders.find((f) => f.id === doc.folderId);
                  return (
                    <article key={doc.id} className="fw-doc-card">
                      <div
                        className="fw-doc-card__preview"
                        onClick={() => !doc.isTrashed && onOpenDocument(doc.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !doc.isTrashed) {
                            e.preventDefault();
                            onOpenDocument(doc.id);
                          }
                        }}
                        aria-label={`เปิดเอกสาร ${doc.title}`}
                      >
                        {doc.isPinned && !doc.isTrashed && (
                          <span className="fw-doc-card__pin-badge" title="ปักหมุดไว้">
                            <Pin size={13} />
                          </span>
                        )}
                        <div className="fw-doc-card__mini-sheet">
                          <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11.5 }}>
                            {doc.title}
                          </div>
                          <div style={{ color: 'var(--color-text-muted)' }}>
                            {doc.plainText.slice(0, 220) || 'เอกสารว่าง — คลิกเพื่อเริ่มพิมพ์...'}
                          </div>
                        </div>
                      </div>

                      <div className="fw-doc-card__body">
                        <div className="fw-doc-card__title-row">
                          <h3
                            className="fw-doc-card__title"
                            onClick={() => !doc.isTrashed && onOpenDocument(doc.id)}
                          >
                            {doc.title}
                          </h3>
                        </div>

                        <div className="fw-doc-card__meta">
                          <span>{formatRelativeDate(doc.updatedAt)}</span>
                          <span>•</span>
                          <span>{doc.wordCount.toLocaleString()} คำ</span>
                          <span>•</span>
                          <span>{doc.pageSize}</span>
                          {folder && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                background: 'var(--color-surface)',
                                padding: '1px 6px',
                                borderRadius: 999,
                              }}
                            >
                              <Folder size={11} color={folder.color} />
                              {folder.name}
                            </span>
                          )}
                        </div>

                        <div className="fw-doc-card__actions">
                          {doc.isTrashed ? (
                            <>
                              <button
                                type="button"
                                className="fw-btn fw-btn--secondary fw-btn--sm"
                                onClick={() => onRestoreFromTrash(doc)}
                              >
                                <RotateCcw size={13} />
                                กู้คืน
                              </button>
                              <button
                                type="button"
                                className="fw-btn fw-btn--danger-ghost fw-btn--sm"
                                onClick={() => onDeleteForever(doc)}
                              >
                                <Trash2 size={13} />
                                ลบถาวร
                              </button>
                            </>
                          ) : (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <button
                                  type="button"
                                  className="fw-tool-btn"
                                  title={doc.isPinned ? 'เลิกปักหมุด' : 'ปักหมุด'}
                                  onClick={() => onTogglePin(doc)}
                                >
                                  {doc.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                                </button>
                                <button
                                  type="button"
                                  className="fw-tool-btn"
                                  title="ทำสำเนา"
                                  onClick={() => onDuplicate(doc)}
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="fw-tool-btn"
                                  title="ดาวน์โหลด .docx ทันที"
                                  onClick={async () => {
                                    await exportDocumentAsDocx(doc);
                                    notify(`ส่งออก "${doc.title}.docx" แล้ว`);
                                  }}
                                >
                                  <Download size={14} />
                                </button>
                              </div>

                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <select
                                  aria-label={`ย้ายโฟลเดอร์สำหรับ ${doc.title}`}
                                  className="fw-ribbon-select"
                                  style={{ maxWidth: 112, height: 26 }}
                                  value={doc.folderId || ''}
                                  onChange={(e) =>
                                    onAssignFolder(doc, e.target.value ? e.target.value : null)
                                  }
                                >
                                  <option value="">ไม่มีโฟลเดอร์</option>
                                  {folders.map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="fw-tool-btn"
                                  style={{ color: 'var(--color-danger)' }}
                                  title="ย้ายไปถังขยะ"
                                  onClick={() => onMoveToTrash(doc)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="fw-doc-table">
                  <thead>
                    <tr>
                      <th>ชื่อเอกสาร</th>
                      <th>โฟลเดอร์</th>
                      <th>จำนวนคำ</th>
                      <th>แก้ไขล่าสุด</th>
                      <th style={{ textAlign: 'right' }}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => {
                      const folder = folders.find((f) => f.id === doc.folderId);
                      return (
                        <tr key={doc.id}>
                          <td>
                            <button
                              type="button"
                              className="fw-btn fw-btn--ghost fw-btn--sm"
                              style={{ fontWeight: 600, paddingLeft: 4 }}
                              onClick={() => !doc.isTrashed && onOpenDocument(doc.id)}
                            >
                              <FileText size={15} color="var(--color-accent)" />
                              {doc.title}
                            </button>
                          </td>
                          <td>{folder ? folder.name : '—'}</td>
                          <td>{doc.wordCount.toLocaleString()} คำ</td>
                          <td>{formatRelativeDate(doc.updatedAt)}</td>
                          <td style={{ textAlign: 'right' }}>
                            {doc.isTrashed ? (
                              <button
                                type="button"
                                className="fw-btn fw-btn--secondary fw-btn--sm"
                                onClick={() => onRestoreFromTrash(doc)}
                              >
                                กู้คืน
                              </button>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: 4 }}>
                                <button
                                  type="button"
                                  className="fw-btn fw-btn--secondary fw-btn--sm"
                                  onClick={() => onOpenDocument(doc.id)}
                                >
                                  เปิดแก้ไข
                                </button>
                                <button
                                  type="button"
                                  className="fw-btn fw-btn--danger-ghost fw-btn--sm"
                                  onClick={() => onMoveToTrash(doc)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>

      {folderModalOpen && (
        <div className="fw-modal-backdrop" onClick={() => setFolderModalOpen(false)}>
          <div
            className="fw-modal"
            style={{ maxWidth: 400 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-folder-title"
          >
            <div className="fw-modal__header">
              <h2 id="modal-folder-title" className="fw-modal__title">
                สร้างโฟลเดอร์ใหม่
              </h2>
              <button
                type="button"
                className="fw-btn fw-btn--ghost fw-btn--sm"
                onClick={() => setFolderModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateFolderSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
                <span>ชื่อโฟลเดอร์</span>
                <input
                  id="input-new-folder-name"
                  type="text"
                  className="fw-input"
                  placeholder="เช่น เอกสารฝ่ายบุคคล, สัญญาคู่ค้า..."
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  required
                />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 'var(--text-sm)' }}>
                <span>สีป้ายกำกับ</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {FOLDER_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewFolderColor(col)}
                      aria-label={`เลือกสี ${col}`}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 999,
                        background: col,
                        border: newFolderColor === col ? '3px solid var(--color-text)' : '2px solid transparent',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  className="fw-btn fw-btn--secondary"
                  onClick={() => setFolderModalOpen(false)}
                >
                  ยกเลิก
                </button>
                <button id="btn-submit-folder" type="submit" className="fw-btn fw-btn--primary">
                  สร้างโฟลเดอร์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
