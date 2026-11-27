import { useCallback, useEffect, useState } from 'react';
import type { DocumentRecord, DocumentTemplate, FolderRecord } from './types';
import {
  createDocument,
  createFolder,
  deleteDocumentForever,
  deleteFolder,
  duplicateDocument,
  emptyTrash,
  ensureSeedWorkspace,
  getDocument,
  listDocuments,
  listFolders,
  updateDocument,
} from './lib/storage';
import { HomeScreen } from './components/HomeScreen';
import { EditorScreen } from './components/EditorScreen';

interface ToastItem {
  id: number;
  message: string;
}

export function App() {
  const [ready, setReady] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [activeDoc, setActiveDoc] = useState<DocumentRecord | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const [docs, flds] = await Promise.all([listDocuments(), listFolders()]);
    setDocuments(docs);
    setFolders(flds);
  }, []);

  useEffect(() => {
    (async () => {
      await ensureSeedWorkspace();
      await refreshWorkspace();
      const hashMatch = window.location.hash.match(/^#\/doc\/(.+)$/);
      if (hashMatch) {
        const found = await getDocument(hashMatch[1]);
        if (found && !found.isTrashed) {
          setActiveDoc(found);
        }
      }
      setReady(true);
    })();

    const onHashChange = async () => {
      const match = window.location.hash.match(/^#\/doc\/(.+)$/);
      if (match) {
        const found = await getDocument(match[1]);
        if (found && !found.isTrashed) {
          setActiveDoc(found);
          return;
        }
      }
      setActiveDoc(null);
      await refreshWorkspace();
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [refreshWorkspace]);

  const openDocumentById = useCallback(async (docId: string) => {
    const found = await getDocument(docId);
    if (found) {
      setActiveDoc(found);
      window.location.hash = `#/doc/${found.id}`;
    }
  }, []);

  const handleBackHome = useCallback(async () => {
    setActiveDoc(null);
    window.location.hash = '#/';
    await refreshWorkspace();
  }, [refreshWorkspace]);

  const handleCreateFromTemplate = useCallback(
    async (template: DocumentTemplate, folderId: string | null) => {
      const created = await createDocument({
        title: template.id === 'blank' ? 'เอกสารไม่มีชื่อ' : template.name,
        contentHtml: template.contentHtml,
        pageSize: template.pageSize,
        orientation: template.orientation,
        margins: template.margins,
        defaultFont: template.defaultFont,
        folderId,
      });
      await refreshWorkspace();
      setActiveDoc(created);
      window.location.hash = `#/doc/${created.id}`;
    },
    [refreshWorkspace],
  );

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-muted)',
        }}
      >
        กำลังเตรียมพื้นที่เอกสาร FolioWrite...
      </div>
    );
  }

  return (
    <>
      {activeDoc ? (
        <EditorScreen
          document={activeDoc}
          onBackHome={handleBackHome}
          onSavePatch={async (patch) => {
            const updated = await updateDocument(activeDoc.id, patch);
            if (updated) {
              setActiveDoc(updated);
            }
          }}
          onSwitchDocument={openDocumentById}
          notify={notify}
        />
      ) : (
        <HomeScreen
          documents={documents}
          folders={folders}
          onOpenDocument={openDocumentById}
          onCreateFromTemplate={handleCreateFromTemplate}
          onTogglePin={async (doc) => {
            await updateDocument(doc.id, { isPinned: !doc.isPinned });
            await refreshWorkspace();
            notify(doc.isPinned ? 'ยกเลิกการปักหมุดแล้ว' : 'ปักหมุดเอกสารแล้ว');
          }}
          onMoveToTrash={async (doc) => {
            await updateDocument(doc.id, { isTrashed: true });
            await refreshWorkspace();
            notify(`ย้าย "${doc.title}" ไปถังขยะแล้ว`);
          }}
          onRestoreFromTrash={async (doc) => {
            await updateDocument(doc.id, { isTrashed: false });
            await refreshWorkspace();
            notify(`กู้คืน "${doc.title}" แล้ว`);
          }}
          onDeleteForever={async (doc) => {
            await deleteDocumentForever(doc.id);
            await refreshWorkspace();
            notify('ลบเอกสารอย่างถาวรแล้ว');
          }}
          onEmptyTrash={async () => {
            await emptyTrash();
            await refreshWorkspace();
            notify('ล้างถังขยะเรียบร้อยแล้ว');
          }}
          onDuplicate={async (doc) => {
            await duplicateDocument(doc.id);
            await refreshWorkspace();
            notify(`สร้างสำเนา "${doc.title}" แล้ว`);
          }}
          onAssignFolder={async (doc, folderId) => {
            await updateDocument(doc.id, { folderId });
            await refreshWorkspace();
            notify('อัปเดตโฟลเดอร์เอกสารแล้ว');
          }}
          onCreateFolder={async (name, color) => {
            await createFolder(name, color);
            await refreshWorkspace();
          }}
          onDeleteFolder={async (folderId) => {
            await deleteFolder(folderId);
            await refreshWorkspace();
          }}
          onRefresh={refreshWorkspace}
          notify={notify}
        />
      )}

      {toasts.length > 0 && (
        <div className="fw-toast-stack" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className="fw-toast">
              {t.message}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default App;
