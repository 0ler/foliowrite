export type PageSize = 'A4' | 'Letter';
export type PageOrientation = 'portrait' | 'landscape';
export type PageMargin = 'normal' | 'narrow' | 'wide';

export interface DocumentRecord {
  id: string;
  title: string;
  contentHtml: string;
  plainText: string;
  folderId: string | null;
  isPinned: boolean;
  isTrashed: boolean;
  pageSize: PageSize;
  orientation: PageOrientation;
  margins: PageMargin;
  defaultFont: string;
  lineSpacing: string;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FolderRecord {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotRecord {
  id: string;
  documentId: string;
  label: string;
  contentHtml: string;
  wordCount: number;
  createdAt: string;
}

export interface DocumentTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  margins: PageMargin;
  defaultFont: string;
  contentHtml: string;
}

export interface TextMetrics {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  paragraphs: number;
  estimatedPages: number;
  readingMinutes: number;
}
