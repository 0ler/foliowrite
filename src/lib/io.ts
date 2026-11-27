import mammoth from 'mammoth';
import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation as DocxOrientation,
  Paragraph,
  ShadingType,
  Table as DocxTable,
  TableCell as DocxTableCell,
  TableRow as DocxTableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import type { DocumentRecord } from '../types';
import { htmlToPlainText } from './metrics';
import { extractPdfToEditableDocument } from './pdfImport';
import { buildWorkspaceBackup, createDocument, restoreWorkspaceBackup, type WorkspaceBackupPayload } from './storage';

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, '-').trim();
  return cleaned || 'FolioWrite-Document';
}

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function markdownOrTextToHtml(text: string, isMarkdown: boolean): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (!isMarkdown) {
    return lines
      .map((line) => (line.trim() ? `<p>${escapeHtml(line)}</p>` : '<p></p>'))
      .join('\n');
  }

  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith('### ')) {
      out.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith('## ')) {
      out.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith('# ')) {
      out.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
    } else if (trimmed.startsWith('> ')) {
      out.push(`<blockquote><p>${escapeHtml(trimmed.slice(2))}</p></blockquote>`);
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      out.push(`<ul><li><p>${escapeHtml(trimmed.slice(2))}</p></li></ul>`);
    } else {
      const formatted = escapeHtml(trimmed)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>');
      out.push(`<p>${formatted}</p>`);
    }
  }
  return out.join('\n') || '<p></p>';
}

export async function importDocumentFile(
  file: File,
  folderId: string | null = null,
): Promise<DocumentRecord> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const baseTitle = file.name.replace(/\.[^/.]+$/, '') || 'เอกสารนำเข้า';

  if (ext === 'pdf') {
    const pdfExtracted = await extractPdfToEditableDocument(file);
    return createDocument({
      title: baseTitle,
      contentHtml: pdfExtracted.html,
      pageSize: pdfExtracted.pageSize,
      orientation: pdfExtracted.orientation,
      folderId,
    });
  }

  if (ext === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value?.trim() || '<p></p>';
    return createDocument({
      title: baseTitle,
      contentHtml: html,
      folderId,
    });
  }

  if (ext === 'html' || ext === 'htm') {
    const raw = await file.text();
    const parsed = new DOMParser().parseFromString(raw, 'text/html');
    parsed.querySelectorAll('script, style, iframe, object').forEach((el) => el.remove());
    const bodyHtml = parsed.body.innerHTML.trim() || '<p></p>';
    const docTitle = parsed.title?.trim() || baseTitle;
    return createDocument({
      title: docTitle,
      contentHtml: bodyHtml,
      folderId,
    });
  }

  if (ext === 'txt' || ext === 'md' || ext === 'markdown') {
    const raw = await file.text();
    const html = markdownOrTextToHtml(raw, ext === 'md' || ext === 'markdown');
    return createDocument({
      title: baseTitle,
      contentHtml: html,
      folderId,
    });
  }

  throw new Error('รองรับเฉพาะไฟล์ .pdf, .docx, .html, .txt และ .md เท่านั้น');
}

export async function convertPdfFileToDocxAndOpen(
  file: File,
  folderId: string | null = null,
  autoDownloadDocx = true,
): Promise<DocumentRecord> {
  const docRecord = await importDocumentFile(file, folderId);
  if (autoDownloadDocx) {
    await exportDocumentAsDocx(docRecord);
  }
  return docRecord;
}

interface InlineRunStyle {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  strike?: boolean;
  subScript?: boolean;
  superScript?: boolean;
  color?: string;
  highlightColor?: string;
  font?: string;
  sizeHalfPt?: number;
}

function cssColorToHex6(cssColor: string | null | undefined): string | undefined {
  if (!cssColor) return undefined;
  const trimmed = cssColor.trim();
  const hexMatch = trimmed.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const h = hexMatch[1];
    return (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toUpperCase();
  }
  const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgbMatch) {
    const toHex = (n: string) => Math.min(255, Math.max(0, Number(n))).toString(16).padStart(2, '0');
    return `${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`.toUpperCase();
  }
  return undefined;
}

function parseFontSizeToHalfPt(cssFontSize: string | null | undefined): number | undefined {
  if (!cssFontSize) return undefined;
  const ptMatch = cssFontSize.match(/([\d.]+)\s*pt/i);
  if (ptMatch) return Math.round(Number(ptMatch[1]) * 2);
  const pxMatch = cssFontSize.match(/([\d.]+)\s*px/i);
  if (pxMatch) return Math.round(Number(pxMatch[1]) * 0.75 * 2);
  return undefined;
}

function parseAlignment(el: HTMLElement): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  const align = el.style?.textAlign || el.getAttribute('align') || '';
  switch (align.toLowerCase()) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'left':
      return AlignmentType.LEFT;
    default:
      return undefined;
  }
}

async function dataUrlOrSrcToBytes(
  src: string,
): Promise<{ data: Uint8Array; type: 'png' | 'jpg' | 'gif' | 'bmp'; width: number; height: number } | null> {
  try {
    let mime = 'image/png';
    let bytes: Uint8Array;

    if (src.startsWith('data:')) {
      const [meta, base64] = src.split(',');
      if (!base64) return null;
      const mimeMatch = meta.match(/data:([^;]+)/);
      if (mimeMatch) mime = mimeMatch[1];
      const binary = atob(base64);
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
    } else {
      const resp = await fetch(src);
      mime = resp.headers.get('content-type') || 'image/png';
      bytes = new Uint8Array(await resp.arrayBuffer());
    }

    const type: 'png' | 'jpg' | 'gif' | 'bmp' = mime.includes('jpeg') || mime.includes('jpg')
      ? 'jpg'
      : mime.includes('gif')
        ? 'gif'
        : mime.includes('bmp')
          ? 'bmp'
          : 'png';

    const dims = await new Promise<{ width: number; height: number }>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth || 420, height: img.naturalHeight || 280 });
      img.onerror = () => resolve({ width: 420, height: 280 });
      img.src = src;
    });

    const maxWidth = 520;
    const scale = dims.width > maxWidth ? maxWidth / dims.width : 1;
    return {
      data: bytes,
      type,
      width: Math.max(40, Math.round(dims.width * scale)),
      height: Math.max(40, Math.round(dims.height * scale)),
    };
  } catch {
    return null;
  }
}

async function collectInlineRuns(
  node: Node,
  inherited: InlineRunStyle,
): Promise<Array<TextRun | ImageRun>> {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || '';
    if (!text) return [];
    return [
      new TextRun({
        text,
        bold: inherited.bold,
        italics: inherited.italics,
        underline: inherited.underline ? { type: UnderlineType.SINGLE } : undefined,
        strike: inherited.strike,
        subScript: inherited.subScript,
        superScript: inherited.superScript,
        color: inherited.color,
        font: inherited.font,
        size: inherited.sizeHalfPt,
        shading: inherited.highlightColor
          ? {
              type: ShadingType.CLEAR,
              color: 'auto',
              fill: inherited.highlightColor,
            }
          : undefined,
      }),
    ];
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === 'br') {
    return [new TextRun({ text: '', break: 1 })];
  }

  if (tag === 'img') {
    const src = el.getAttribute('src') || '';
    if (!src) return [];
    const parsedImg = await dataUrlOrSrcToBytes(src);
    if (!parsedImg) return [];
    const customW = Number(el.getAttribute('width') || el.style.width?.replace('px', ''));
    const ratio = parsedImg.height / parsedImg.width;
    const finalW = !Number.isNaN(customW) && customW > 20 ? Math.min(540, customW) : parsedImg.width;
    const finalH = Math.round(finalW * ratio);
    return [
      new ImageRun({
        data: parsedImg.data,
        type: parsedImg.type,
        transformation: {
          width: finalW,
          height: finalH,
        },
      }),
    ];
  }

  const nextStyle: InlineRunStyle = { ...inherited };
  if (tag === 'strong' || tag === 'b') nextStyle.bold = true;
  if (tag === 'em' || tag === 'i') nextStyle.italics = true;
  if (tag === 'u') nextStyle.underline = true;
  if (tag === 's' || tag === 'strike' || tag === 'del') nextStyle.strike = true;
  if (tag === 'sub') nextStyle.subScript = true;
  if (tag === 'sup') nextStyle.superScript = true;
  if (tag === 'code') nextStyle.font = 'JetBrains Mono';
  if (tag === 'a') {
    nextStyle.underline = true;
    nextStyle.color = '0D6B5E';
  }
  if (tag === 'mark') {
    nextStyle.highlightColor = cssColorToHex6(el.style.backgroundColor) || 'FFF3A3';
  }

  const inlineColor = cssColorToHex6(el.style?.color);
  if (inlineColor) nextStyle.color = inlineColor;
  const inlineBg = cssColorToHex6(el.style?.backgroundColor);
  if (inlineBg) nextStyle.highlightColor = inlineBg;
  if (el.style?.fontFamily) {
    nextStyle.font = el.style.fontFamily.replace(/['"]/g, '').split(',')[0].trim();
  }
  const sizeHalfPt = parseFontSizeToHalfPt(el.style?.fontSize);
  if (sizeHalfPt) nextStyle.sizeHalfPt = sizeHalfPt;

  const runs: Array<TextRun | ImageRun> = [];
  for (const child of Array.from(el.childNodes)) {
    const childRuns = await collectInlineRuns(child, nextStyle);
    runs.push(...childRuns);
  }
  return runs;
}

async function convertBlockNodes(
  nodes: NodeListOf<ChildNode> | ChildNode[],
  defaultFont: string,
): Promise<Array<Paragraph | DocxTable>> {
  const out: Array<Paragraph | DocxTable> = [];
  const baseStyle: InlineRunStyle = { font: defaultFont, sizeHalfPt: 24 };

  for (const node of Array.from(nodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || '').trim();
      if (txt) {
        out.push(new Paragraph({ children: [new TextRun({ text: txt, font: defaultFont, size: 24 })] }));
      }
      continue;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const headingMap = {
        h1: { level: HeadingLevel.HEADING_1, size: 36 },
        h2: { level: HeadingLevel.HEADING_2, size: 30 },
        h3: { level: HeadingLevel.HEADING_3, size: 26 },
      } as const;
      const spec = headingMap[tag];
      const runs = await collectInlineRuns(el, { font: defaultFont, bold: true, sizeHalfPt: spec.size });
      out.push(
        new Paragraph({
          heading: spec.level,
          alignment: parseAlignment(el),
          spacing: { before: 220, after: 120 },
          children: runs,
        }),
      );
      continue;
    }

    if (tag === 'p') {
      const runs = await collectInlineRuns(el, baseStyle);
      out.push(
        new Paragraph({
          alignment: parseAlignment(el),
          spacing: { after: 140, line: 340 },
          children: runs.length > 0 ? runs : [new TextRun({ text: '', font: defaultFont, size: 24 })],
        }),
      );
      continue;
    }

    if (tag === 'blockquote') {
      const runs = await collectInlineRuns(el, { ...baseStyle, italics: true, color: '4C5853' });
      out.push(
        new Paragraph({
          indent: { left: 480 },
          border: {
            left: { style: BorderStyle.SINGLE, size: 12, color: '0D6B5E', space: 10 },
          },
          spacing: { before: 140, after: 140 },
          children: runs,
        }),
      );
      continue;
    }

    if (tag === 'ul' || tag === 'ol') {
      const isTaskList = el.getAttribute('data-type') === 'taskList';
      const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li') as HTMLElement[];
      let idx = 1;
      for (const li of items) {
        const checked = li.getAttribute('data-checked') === 'true';
        const prefix = isTaskList ? (checked ? '☑ ' : '☐ ') : tag === 'ol' ? `${idx}. ` : '• ';
        const runs = await collectInlineRuns(li, baseStyle);
        out.push(
          new Paragraph({
            indent: { left: 420, hanging: 240 },
            spacing: { after: 80 },
            children: [new TextRun({ text: prefix, bold: tag === 'ol', font: defaultFont, size: 24 }), ...runs],
          }),
        );
        idx += 1;
      }
      continue;
    }

    if (el.getAttribute('data-page-break') === 'true') {
      if (el.getAttribute('data-auto') !== 'true') {
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
      }
      continue;
    }

    if (tag === 'hr') {
      out.push(
        new Paragraph({
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'E5E7EB', space: 4 },
          },
          spacing: { before: 120, after: 120 },
          children: [],
        }),
      );
      continue;
    }

    if (tag === 'table') {
      const trElements = Array.from(el.querySelectorAll('tr'));
      if (trElements.length > 0) {
        const rows: DocxTableRow[] = [];
        for (const tr of trElements) {
          const cellEls = Array.from(tr.children).filter((c) =>
            ['td', 'th'].includes(c.tagName.toLowerCase()),
          ) as HTMLElement[];
          const cells: DocxTableCell[] = [];
          for (const cellEl of cellEls) {
            const isHeader = cellEl.tagName.toLowerCase() === 'th';
            const cellChildren = await convertBlockNodes(cellEl.childNodes, defaultFont);
            const fallbackRuns =
              cellChildren.length === 0
                ? [
                    new Paragraph({
                      children: await collectInlineRuns(cellEl, {
                        ...baseStyle,
                        bold: isHeader,
                      }),
                    }),
                  ]
                : cellChildren;

            cells.push(
              new DocxTableCell({
                shading: isHeader
                  ? { type: ShadingType.CLEAR, color: 'auto', fill: 'F4F5F4' }
                  : undefined,
                margins: { top: 100, bottom: 100, left: 140, right: 140 },
                children: fallbackRuns,
              }),
            );
          }
          if (cells.length > 0) {
            rows.push(new DocxTableRow({ children: cells }));
          }
        }
        if (rows.length > 0) {
          out.push(
            new DocxTable({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows,
            }),
          );
          out.push(new Paragraph({ children: [] }));
        }
      }
      continue;
    }

    const fallbackRuns = await collectInlineRuns(el, baseStyle);
    if (fallbackRuns.length > 0) {
      const imgAlignAttr = tag === 'img' ? el.getAttribute('data-align') : null;
      const imgAlignment =
        imgAlignAttr === 'center'
          ? AlignmentType.CENTER
          : imgAlignAttr === 'right'
            ? AlignmentType.RIGHT
            : imgAlignAttr === 'left'
              ? AlignmentType.LEFT
              : parseAlignment(el);
      out.push(
        new Paragraph({
          alignment: imgAlignment,
          children: fallbackRuns,
          spacing: { before: 100, after: 140 },
        }),
      );
    }
  }

  return out;
}

export async function exportDocumentAsDocx(doc: DocumentRecord): Promise<void> {
  const parsed = new DOMParser().parseFromString(doc.contentHtml || '<p></p>', 'text/html');
  const children = await convertBlockNodes(parsed.body.childNodes, doc.defaultFont || 'Sarabun');

  const marginTwipsMap = {
    normal: 1440, // 1 inch = 25.4mm
    narrow: 720,  // 0.5 inch = 12.7mm
    wide: 2160,   // 1.5 inch = 38.1mm
  } as const;
  const marginVal = marginTwipsMap[doc.margins] ?? 1440;

  // A4: 11906 x 16838 twips, Letter: 12240 x 15840 twips
  const baseWidth = doc.pageSize === 'Letter' ? 12240 : 11906;
  const baseHeight = doc.pageSize === 'Letter' ? 15840 : 16838;

  const effectiveHeader =
    doc.showHeader === false ? '' : (doc.headerText ?? doc.title ?? '').trim();
  const showFooterZone = doc.showFooter !== false;
  const effectiveFooter = showFooterZone ? (doc.footerText ?? '').trim() : '';
  const includePageNum = showFooterZone && doc.showPageNumbers !== false;
  const fontName = doc.defaultFont || 'Sarabun';

  const headerRuns: TextRun[] = [];
  if (effectiveHeader) {
    headerRuns.push(
      new TextRun({
        text: effectiveHeader,
        font: fontName,
        size: 19,
        color: '535862',
      }),
    );
  }

  const footerRuns: TextRun[] = [];
  if (effectiveFooter) {
    footerRuns.push(new TextRun({ text: effectiveFooter, font: fontName, size: 18, color: '717680' }));
  }
  if (includePageNum) {
    footerRuns.push(
      new TextRun({
        children: [effectiveFooter ? '   •   หน้า ' : 'หน้า ', PageNumber.CURRENT, ' จาก ', PageNumber.TOTAL_PAGES],
        font: fontName,
        size: 18,
        color: '717680',
      }),
    );
  }

  const docx = new DocxDocument({
    title: doc.title,
    creator: 'FolioWrite',
    sections: [
      {
        properties: {
          page: {
            size: {
              width: baseWidth,
              height: baseHeight,
              orientation:
                doc.orientation === 'landscape'
                  ? DocxOrientation.LANDSCAPE
                  : DocxOrientation.PORTRAIT,
            },
            margin: {
              top: marginVal,
              right: marginVal,
              bottom: marginVal,
              left: marginVal,
            },
          },
        },
        headers:
          headerRuns.length > 0
            ? {
                default: new Header({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      border: {
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E5E7EB', space: 6 },
                      },
                      spacing: { after: 140 },
                      children: headerRuns,
                    }),
                  ],
                }),
              }
            : undefined,
        footers:
          footerRuns.length > 0
            ? {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: footerRuns,
                    }),
                  ],
                }),
              }
            : undefined,
        children: children.length > 0 ? children : [new Paragraph({ children: [] })],
      },
    ],
  });

  const blob = await Packer.toBlob(docx);
  triggerBlobDownload(blob, `${sanitizeFileName(doc.title)}.docx`);
}

export function exportDocumentAsHtml(doc: DocumentRecord): void {
  const standalone = `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(doc.title)}</title>
  <style>
    body {
      font-family: '${doc.defaultFont}', 'Sarabun', 'Inter', sans-serif;
      max-width: 780px;
      margin: 40px auto;
      padding: 0 24px;
      line-height: ${doc.lineSpacing || '1.5'};
      color: #131a17;
    }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { border: 1px solid #d5dbd8; padding: 8px 12px; text-align: left; }
    th { background: #f4f5f4; }
    blockquote { border-left: 3px solid #0d6b5e; margin: 16px 0; padding-left: 16px; color: #4c5853; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body>
${doc.contentHtml}
</body>
</html>`;
  const blob = new Blob([standalone], { type: 'text/html;charset=utf-8' });
  triggerBlobDownload(blob, `${sanitizeFileName(doc.title)}.html`);
}

export function exportDocumentAsTxt(doc: DocumentRecord): void {
  const text = htmlToPlainText(doc.contentHtml);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, `${sanitizeFileName(doc.title)}.txt`);
}

export function exportDocumentAsMarkdown(doc: DocumentRecord): void {
  const parsed = new DOMParser().parseFromString(doc.contentHtml || '<p></p>', 'text/html');
  const lines: string[] = [];

  for (const el of Array.from(parsed.body.children)) {
    const tag = el.tagName.toLowerCase();
    const txt = (el.textContent || '').trim();
    if (tag === 'h1') lines.push(`# ${txt}\n`);
    else if (tag === 'h2') lines.push(`## ${txt}\n`);
    else if (tag === 'h3') lines.push(`### ${txt}\n`);
    else if (tag === 'blockquote') lines.push(`> ${txt}\n`);
    else if (tag === 'ul') {
      Array.from(el.querySelectorAll('li')).forEach((li) => {
        lines.push(`- ${(li.textContent || '').trim()}`);
      });
      lines.push('');
    } else if (tag === 'ol') {
      Array.from(el.querySelectorAll('li')).forEach((li, i) => {
        lines.push(`${i + 1}. ${(li.textContent || '').trim()}`);
      });
      lines.push('');
    } else if (tag === 'hr') {
      lines.push('---\n');
    } else if (txt) {
      lines.push(`${txt}\n`);
    }
  }

  const blob = new Blob([lines.join('\n').trim() + '\n'], { type: 'text/markdown;charset=utf-8' });
  triggerBlobDownload(blob, `${sanitizeFileName(doc.title)}.md`);
}

export async function downloadWorkspaceBackupJson(): Promise<void> {
  const payload = await buildWorkspaceBackup();
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const dateTag = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(blob, `FolioWrite-Backup-${dateTag}.json`);
}

export async function importWorkspaceBackupJson(file: File): Promise<number> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as WorkspaceBackupPayload;
  return restoreWorkspaceBackup(parsed);
}
