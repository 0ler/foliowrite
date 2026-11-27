import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DocumentRecord, FolderRecord, SnapshotRecord } from '../types';
import { computeTextMetrics, htmlToPlainText } from './metrics';
import { STARTER_TEMPLATES } from './templates';

interface FolioWriteDB extends DBSchema {
  documents: {
    key: string;
    value: DocumentRecord;
    indexes: {
      'by-updated': string;
      'by-folder': string;
    };
  };
  folders: {
    key: string;
    value: FolderRecord;
  };
  snapshots: {
    key: string;
    value: SnapshotRecord;
    indexes: {
      'by-document': string;
    };
  };
}

const DB_NAME = 'foliowrite_db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<FolioWriteDB>> | null = null;

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `fw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function getDB(): Promise<IDBPDatabase<FolioWriteDB>> {
  if (!dbPromise) {
    dbPromise = openDB<FolioWriteDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('documents')) {
          const docStore = db.createObjectStore('documents', { keyPath: 'id' });
          docStore.createIndex('by-updated', 'updatedAt');
          docStore.createIndex('by-folder', 'folderId');
        }
        if (!db.objectStoreNames.contains('folders')) {
          db.createObjectStore('folders', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          const snapStore = db.createObjectStore('snapshots', { keyPath: 'id' });
          snapStore.createIndex('by-document', 'documentId');
        }
      },
    });
  }
  return dbPromise;
}

let seedPromise: Promise<void> | null = null;

export function ensureSeedWorkspace(): Promise<void> {
  if (!seedPromise) {
    seedPromise = runSeedWorkspace();
  }
  return seedPromise;
}

async function runSeedWorkspace(): Promise<void> {
  const db = await getDB();
  const existingDocs = await db.count('documents');
  const seededFlag = localStorage.getItem('foliowrite_seeded_v1');
  if (existingDocs > 0 || seededFlag === '1') {
    return;
  }
  localStorage.setItem('foliowrite_seeded_v1', '1');

  const now = new Date().toISOString();
  const folderWorkId = generateId();
  const folderTeamId = generateId();

  await db.put('folders', {
    id: folderWorkId,
    name: 'เอกสารงานโครงการ',
    color: '#0d6b5e',
    createdAt: now,
    updatedAt: now,
  });

  await db.put('folders', {
    id: folderTeamId,
    name: 'การประชุมและบันทึกภายใน',
    color: '#8f5600',
    createdAt: now,
    updatedAt: now,
  });

  const welcomeHtml = `
    <h1>ยินดีต้อนรับสู่ FolioWrite</h1>
    <p><strong>FolioWrite</strong> คือโปรแกรมพิมพ์และจัดการเอกสารแบบ <em>Local-first</em> ที่ออกแบบให้ใช้งานได้ลื่นไหลทั้งบน <strong>คอมพิวเตอร์ แท็บเล็ต และมือถือ</strong> โดยข้อมูลทั้งหมดถูกจัดเก็บไว้ในเครื่องของคุณอย่างปลอดภัย ไม่ต้องสมัครสมาชิก</p>
    <h2>ความสามารถหลักที่พร้อมใช้งานทันที</h2>
    <ul>
      <li><strong>จัดรูปแบบครบครัน:</strong> หัวข้อ ฟอนต์ภาษาไทยและสากล สีข้อความ ไฮไลต์ ย่อหน้า รายการลำดับ และรายการเช็กลิสต์</li>
      <li><strong>ตารางและรูปภาพ:</strong> แทรกตาราง เพิ่ม/ลบแถวและคอลัมน์ รวมถึงแทรกรูปภาพจากเครื่องพร้อมปรับขนาดได้ทันที</li>
      <li><strong>รองรับไฟล์มาตรฐาน:</strong> นำเข้าไฟล์ <code>.docx</code>, <code>.html</code>, <code>.txt</code> และส่งออกกลับเป็นไฟล์ <code>.docx</code> หรือสั่งพิมพ์เป็น <strong>PDF</strong> ขนาด A4 / Letter คมชัด</li>
      <li><strong>ปรับมุมมองอัตโนมัติตามอุปกรณ์:</strong> บนมือถือสามารถสลับระหว่าง <em>มุมมองอ่านพอดีจอ (Mobile Reflow)</em> และ <em>มุมมองหน้ากระดาษจริง (Print Layout)</em></li>
    </ul>
    <h2>ตัวอย่างตารางสรุปทางลัดแป้นพิมพ์</h2>
    <table>
      <thead>
        <tr>
          <th>คำสั่ง</th>
          <th>Windows / Linux</th>
          <th>macOS / iPad</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>ตัวหนา / ตัวเอียง / ขีดเส้นใต้</td>
          <td>Ctrl + B / I / U</td>
          <td>Cmd + B / I / U</td>
        </tr>
        <tr>
          <td>เลิกทำ / ทำซ้ำ</td>
          <td>Ctrl + Z / Ctrl + Y</td>
          <td>Cmd + Z / Cmd + Shift + Z</td>
        </tr>
        <tr>
          <td>ค้นหาและแทนที่คำ</td>
          <td>Ctrl + F</td>
          <td>Cmd + F</td>
        </tr>
        <tr>
          <td>สั่งพิมพ์ / บันทึกเป็น PDF</td>
          <td>Ctrl + P</td>
          <td>Cmd + P</td>
        </tr>
      </tbody>
    </table>
    <blockquote>เคล็ดลับ: คุณสามารถกดปุ่ม <strong>ไฟล์ / ส่งออก</strong> มุมขวาบนเพื่อดาวน์โหลดเอกสารนี้เป็นไฟล์ <code>.docx</code> ไปเปิดต่อในโปรแกรมเอกสารอื่นได้ทันที</blockquote>
  `.trim();

  const welcomeMetrics = computeTextMetrics(welcomeHtml);
  await db.put('documents', {
    id: generateId(),
    title: 'คู่มือเริ่มต้นใช้งาน FolioWrite (ข้ามอุปกรณ์)',
    contentHtml: welcomeHtml,
    plainText: htmlToPlainText(welcomeHtml),
    folderId: folderWorkId,
    isPinned: true,
    isTrashed: false,
    pageSize: 'A4',
    orientation: 'portrait',
    margins: 'normal',
    defaultFont: 'Sarabun',
    lineSpacing: '1.5',
    wordCount: welcomeMetrics.words,
    createdAt: now,
    updatedAt: now,
  });

  const meetingTpl = STARTER_TEMPLATES.find((t) => t.id === 'meeting-notes')!;
  const meetingMetrics = computeTextMetrics(meetingTpl.contentHtml);
  await db.put('documents', {
    id: generateId(),
    title: 'รายงานการประชุมทีมประจำสัปดาห์',
    contentHtml: meetingTpl.contentHtml,
    plainText: htmlToPlainText(meetingTpl.contentHtml),
    folderId: folderTeamId,
    isPinned: false,
    isTrashed: false,
    pageSize: meetingTpl.pageSize,
    orientation: meetingTpl.orientation,
    margins: meetingTpl.margins,
    defaultFont: meetingTpl.defaultFont,
    lineSpacing: '1.5',
    wordCount: meetingMetrics.words,
    createdAt: new Date(Date.now() - 3600_000).toISOString(),
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
  });

  localStorage.setItem('foliowrite_seeded_v1', '1');
}

export async function listDocuments(): Promise<DocumentRecord[]> {
  const db = await getDB();
  const all = await db.getAll('documents');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const db = await getDB();
  return db.get('documents', id);
}

export async function createDocument(init: Partial<DocumentRecord> = {}): Promise<DocumentRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const contentHtml = init.contentHtml ?? '<p></p>';
  const metrics = computeTextMetrics(contentHtml);
  const record: DocumentRecord = {
    id: init.id ?? generateId(),
    title: init.title?.trim() || 'เอกสารไม่มีชื่อ',
    contentHtml,
    plainText: htmlToPlainText(contentHtml),
    folderId: init.folderId ?? null,
    isPinned: init.isPinned ?? false,
    isTrashed: false,
    pageSize: init.pageSize ?? 'A4',
    orientation: init.orientation ?? 'portrait',
    margins: init.margins ?? 'normal',
    defaultFont: init.defaultFont ?? 'Sarabun',
    lineSpacing: init.lineSpacing ?? '1.5',
    wordCount: metrics.words,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('documents', record);
  return record;
}

export async function updateDocument(
  id: string,
  patch: Partial<DocumentRecord>,
): Promise<DocumentRecord | undefined> {
  const db = await getDB();
  const existing = await db.get('documents', id);
  if (!existing) return undefined;

  const contentHtml = patch.contentHtml ?? existing.contentHtml;
  const plainText =
    patch.contentHtml !== undefined ? htmlToPlainText(contentHtml) : existing.plainText;
  const wordCount =
    patch.contentHtml !== undefined
      ? computeTextMetrics(contentHtml).words
      : (patch.wordCount ?? existing.wordCount);

  const updated: DocumentRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    contentHtml,
    plainText,
    wordCount,
    updatedAt: new Date().toISOString(),
  };
  await db.put('documents', updated);
  return updated;
}

export async function duplicateDocument(id: string): Promise<DocumentRecord | undefined> {
  const existing = await getDocument(id);
  if (!existing) return undefined;
  return createDocument({
    title: `${existing.title} (สำเนา)`,
    contentHtml: existing.contentHtml,
    folderId: existing.folderId,
    pageSize: existing.pageSize,
    orientation: existing.orientation,
    margins: existing.margins,
    defaultFont: existing.defaultFont,
    lineSpacing: existing.lineSpacing,
  });
}

export async function deleteDocumentForever(id: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['documents', 'snapshots'], 'readwrite');
  await tx.objectStore('documents').delete(id);
  const snapIndex = tx.objectStore('snapshots').index('by-document');
  let cursor = await snapIndex.openCursor(id);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function emptyTrash(): Promise<void> {
  const docs = await listDocuments();
  const trashed = docs.filter((d) => d.isTrashed);
  for (const doc of trashed) {
    await deleteDocumentForever(doc.id);
  }
}

export async function listFolders(): Promise<FolderRecord[]> {
  const db = await getDB();
  const all = await db.getAll('folders');
  return all.sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

export async function createFolder(name: string, color = '#0d6b5e'): Promise<FolderRecord> {
  const db = await getDB();
  const now = new Date().toISOString();
  const folder: FolderRecord = {
    id: generateId(),
    name: name.trim() || 'โฟลเดอร์ใหม่',
    color,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('folders', folder);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<FolderRecord | undefined> {
  const db = await getDB();
  const existing = await db.get('folders', id);
  if (!existing) return undefined;
  const updated: FolderRecord = {
    ...existing,
    name: name.trim() || existing.name,
    updatedAt: new Date().toISOString(),
  };
  await db.put('folders', updated);
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  const db = await getDB();
  const docs = await db.getAll('documents');
  for (const doc of docs) {
    if (doc.folderId === id) {
      await db.put('documents', { ...doc, folderId: null });
    }
  }
  await db.delete('folders', id);
}

export async function createSnapshot(documentId: string, label?: string): Promise<SnapshotRecord | undefined> {
  const db = await getDB();
  const doc = await db.get('documents', documentId);
  if (!doc) return undefined;
  const now = new Date().toISOString();
  const snap: SnapshotRecord = {
    id: generateId(),
    documentId,
    label: label?.trim() || `จุดบันทึก ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`,
    contentHtml: doc.contentHtml,
    wordCount: doc.wordCount,
    createdAt: now,
  };
  await db.put('snapshots', snap);
  return snap;
}

export async function listSnapshots(documentId: string): Promise<SnapshotRecord[]> {
  const db = await getDB();
  const list = await db.getAllFromIndex('snapshots', 'by-document', documentId);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface WorkspaceBackupPayload {
  app: 'FolioWrite';
  version: 1;
  exportedAt: string;
  folders: FolderRecord[];
  documents: DocumentRecord[];
}

export async function buildWorkspaceBackup(): Promise<WorkspaceBackupPayload> {
  const [folders, documents] = await Promise.all([listFolders(), listDocuments()]);
  return {
    app: 'FolioWrite',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders,
    documents,
  };
}

export async function restoreWorkspaceBackup(payload: WorkspaceBackupPayload): Promise<number> {
  if (!payload || !Array.isArray(payload.documents)) {
    throw new Error('รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง');
  }
  const db = await getDB();
  if (Array.isArray(payload.folders)) {
    for (const folder of payload.folders) {
      if (folder?.id && folder?.name) {
        await db.put('folders', folder);
      }
    }
  }
  let importedCount = 0;
  for (const doc of payload.documents) {
    if (doc?.id && typeof doc.contentHtml === 'string') {
      await db.put('documents', doc);
      importedCount += 1;
    }
  }
  return importedCount;
}
