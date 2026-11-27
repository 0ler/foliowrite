import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageOrientation, PageSize } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfImportResult {
  html: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  pageCount: number;
  usedImageFallbackPages: number;
}

interface PositionedGlyphRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  italic: boolean;
}

interface VisualLine {
  y: number;
  minX: number;
  maxX: number;
  avgFontSize: number;
  maxFontSize: number;
  runs: PositionedGlyphRun[];
}

interface ColumnSegment {
  minX: number;
  maxX: number;
  runs: PositionedGlyphRun[];
  text: string;
}

const THAI_PUA_MAP: Record<number, string> = {
  // Common WinAnsi / MacThai / PDF subset PUA mappings -> standard Unicode Thai
  0xf700: '\u0e10', // ฐ
  0xf701: '\u0e34', // ิ
  0xf702: '\u0e35', // ี
  0xf703: '\u0e36', // ึ
  0xf704: '\u0e37', // ื
  0xf705: '\u0e48', // ่
  0xf706: '\u0e49', // ้
  0xf707: '\u0e4a', // ๊
  0xf708: '\u0e4b', // ๋
  0xf709: '\u0e4c', // ์
  0xf70a: '\u0e48', // ่
  0xf70b: '\u0e49', // ้
  0xf70c: '\u0e4a', // ๊
  0xf70d: '\u0e4b', // ๋
  0xf70e: '\u0e4c', // ์
  0xf70f: '\u0e0d', // ญ
  0xf710: '\u0e31', // ั
  0xf711: '\u0e4d', // ํ
  0xf712: '\u0e47', // ็
  0xf713: '\u0e48', // ่
  0xf714: '\u0e49', // ้
  0xf715: '\u0e4a', // ๊
  0xf716: '\u0e4b', // ๋
  0xf717: '\u0e4c', // ์
  0xf718: '\u0e38', // ุ
  0xf719: '\u0e39', // ู
  0xf71a: '\u0e3a', // ฺ
};

/**
 * Repairs Thai text extracted from PDF font subsets where:
 * 1) Positioned OpenType tone/taikhu glyphs have missing ToUnicode entries (\u0000)
 * 2) Wide leading vowels (แ, เ, โ, ไ, ใ) trigger synthetic kerning spaces ("แ ละ" -> "และ")
 * 3) Decomposed Sara Am (\u0e4d\u0e32) needs canonical composition (\u0e33)
 */
export function repairThaiPdfString(raw: string): string {
  if (!raw) return '';

  // Step 1: Map PUA characters while keeping \u0000 temporarily so we can infer exact missing mark
  let s = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (THAI_PUA_MAP[code]) {
      s += THAI_PUA_MAP[code];
    } else {
      s += raw[i];
    }
  }

  // Step 2: Infer missing OpenType Thai glyph variants that PDF subsets emit as \u0000:
  // - (เ|แ) + consonant + \u0000 -> ็ (Mai Taikhu, e.g. เป็น, เห็น, เต็ม, แข็ง)
  s = s.replace(/([\u0e40\u0e41][\u0e01-\u0e2e])\u0000/g, '$1\u0e47');
  // - (นี|นี|ขึ|ตั|ทั|นั|ยั|ชั|ดั|มั) + \u0000 -> ้ (Mai Tho on upper vowel: นี้, ขึ้น, ตั้ง, ทั้ง, นั้น)
  s = s.replace(/(นี|ขึ|ตั|ทั|นั|ยั|ชั|ขั|สั|มั|รั|ลั)\u0000/g, '$1\u0e49');
  // - Remaining upper vowel (\u0e31, \u0e34-\u0e37) + \u0000 -> ่ (Mai Ek shifted up: ที่, พื่อ, เรื่อง, พึ่ง, ชื่อ)
  s = s.replace(/([\u0e31\u0e34-\u0e37])\u0000/g, '$1\u0e48');
  // - Tall consonant (ป, ฝ, ฟ, ฬ) + \u0000 -> ่ (Mai Ek shifted left: ฝ่าย, ป่า)
  s = s.replace(/([\u0e1b\u0e1d\u0e1f\u0e2c])\u0000/g, '$1\u0e48');
  // - Any remaining \u0000 after a Thai consonant -> ่
  s = s.replace(/([\u0e01-\u0e2e])\u0000/g, '$1\u0e48');
  // Strip any leftover stray \u0000
  s = s.replace(/\u0000/g, '');

  // Step 3: Normalize compatibility ligatures & fix decomposed Sara Am (ํ + า -> ำ)
  s = s
    .normalize('NFKC')
    .replace(/\u0e4d\u0e32/g, '\u0e33')
    .replace(/([\u0e48-\u0e4b])\u0e4d\u0e32/g, '$1\u0e33');

  // Step 4: Remove spurious kerning space right after Thai leading vowels (เ แ โ ใ ไ) before Thai consonants
  // In Thai orthography, leading vowels NEVER end a word before a space!
  s = s.replace(/([\u0e40-\u0e44])\s+([\u0e01-\u0e2e])/g, '$1$2');

  return s;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isThaiCombiningChar(ch: string): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
}

function joinRunsIntoRichHtml(runs: PositionedGlyphRun[], bodyFontSize: number): string {
  // Filter out empty runs & synthetic whitespace-only spacer runs (whose width is often overstated in PDFs)
  const meaningful = runs
    .filter((r) => r.str.trim().length > 0)
    .sort((a, b) => a.x - b.x);

  if (meaningful.length === 0) return '';

  const segments: Array<{ text: string; bold: boolean; italic: boolean; fontSize: number }> = [];

  for (let i = 0; i < meaningful.length; i += 1) {
    const cur = meaningful[i];
    const prev = i > 0 ? meaningful[i - 1] : null;

    let prefixSpace = '';
    if (prev) {
      const prevEnd = prev.x + Math.max(prev.width, 0);
      const gap = cur.x - prevEnd;
      const firstChar = cur.str[0] || '';
      const lastPrevChar = prev.str[prev.str.length - 1] || '';
      const prevEndsWithLeadingVowel = /[\u0e40-\u0e44]$/.test(prev.str.trim());

      if (
        !isThaiCombiningChar(firstChar) &&
        !prevEndsWithLeadingVowel &&
        !lastPrevChar.endsWith(' ') &&
        !cur.str.startsWith(' ') &&
        gap > cur.fontSize * 0.2
      ) {
        prefixSpace = ' ';
      }
    }

    const piece = prefixSpace + cur.str;
    const lastSeg = segments[segments.length - 1];
    if (
      lastSeg &&
      lastSeg.bold === cur.bold &&
      lastSeg.italic === cur.italic &&
      Math.abs(lastSeg.fontSize - cur.fontSize) < 1.2
    ) {
      lastSeg.text += piece;
    } else {
      segments.push({
        text: piece,
        bold: cur.bold,
        italic: cur.italic,
        fontSize: cur.fontSize,
      });
    }
  }

  return segments
    .map((seg) => {
      const repaired = repairThaiPdfString(seg.text);
      let html = escapeHtml(repaired);
      if (!html) return '';
      if (seg.bold) html = `<strong>${html}</strong>`;
      if (seg.italic) html = `<em>${html}</em>`;
      if (Math.abs(seg.fontSize - bodyFontSize) >= 2.5) {
        const pt = Math.max(9, Math.min(36, Math.round(seg.fontSize)));
        html = `<span style="font-size: ${pt}pt">${html}</span>`;
      }
      return html;
    })
    .join('');
}

function joinRunsPlainText(runs: PositionedGlyphRun[]): string {
  const meaningful = runs
    .filter((r) => r.str.trim().length > 0)
    .sort((a, b) => a.x - b.x);
  if (meaningful.length === 0) return '';

  let acc = '';
  for (let i = 0; i < meaningful.length; i += 1) {
    const cur = meaningful[i];
    if (i > 0) {
      const prev = meaningful[i - 1];
      const gap = cur.x - (prev.x + Math.max(prev.width, 0));
      const prevEndsWithLeadingVowel = /[\u0e40-\u0e44]$/.test(prev.str.trim());
      if (
        !isThaiCombiningChar(cur.str[0] || '') &&
        !prevEndsWithLeadingVowel &&
        gap > cur.fontSize * 0.2
      ) {
        acc += ' ';
      }
    }
    acc += cur.str;
  }
  return repairThaiPdfString(acc).trim();
}

function splitLineIntoColumns(line: VisualLine): ColumnSegment[] {
  const meaningful = line.runs
    .filter((r) => r.str.trim().length > 0)
    .sort((a, b) => a.x - b.x);
  if (meaningful.length === 0) return [];

  const groups: PositionedGlyphRun[][] = [[meaningful[0]]];
  for (let i = 1; i < meaningful.length; i += 1) {
    const prev = meaningful[i - 1];
    const cur = meaningful[i];
    const gap = cur.x - (prev.x + Math.max(prev.width, 0));
    // Distinct column gap threshold (> 1.25x font size, min 15pt — normal word space is ~3-5pt)
    const threshold = Math.max(15, line.avgFontSize * 1.25);
    if (gap > threshold) {
      groups.push([cur]);
    } else {
      groups[groups.length - 1].push(cur);
    }
  }

  return groups
    .map((runs) => ({
      minX: Math.min(...runs.map((r) => r.x)),
      maxX: Math.max(...runs.map((r) => r.x + Math.max(r.width, 4))),
      runs,
      text: joinRunsPlainText(runs),
    }))
    .filter((seg) => seg.text.length > 0);
}

function detectAlignment(
  line: VisualLine,
  contentLeft: number,
  contentRight: number,
): 'left' | 'center' | 'right' {
  const usableWidth = Math.max(120, contentRight - contentLeft);
  const lineWidth = Math.max(10, line.maxX - line.minX);
  if (lineWidth > usableWidth * 0.82) {
    return 'left';
  }

  const leftMargin = Math.max(0, line.minX - contentLeft);
  const rightMargin = Math.max(0, contentRight - line.maxX);
  const lineCenter = (line.minX + line.maxX) / 2;
  const pageCenter = (contentLeft + contentRight) / 2;

  if (
    leftMargin > 28 &&
    rightMargin > 28 &&
    Math.abs(lineCenter - pageCenter) <= usableWidth * 0.08
  ) {
    return 'center';
  }

  if (leftMargin > usableWidth * 0.42 && rightMargin < usableWidth * 0.16) {
    return 'right';
  }

  return 'left';
}

function median(values: number[]): number {
  if (values.length === 0) return 12;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

async function renderPageAsHighResPng(page: pdfjsLib.PDFPageProxy): Promise<string> {
  const viewport = page.getViewport({ scale: 1.8 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL('image/png');
}

function matchesColumnAnchors(cols: ColumnSegment[], anchors: number[]): boolean {
  if (cols.length === 0) return false;
  return cols.every((seg) => anchors.some((a) => Math.abs(seg.minX - a) < 52));
}

function assignSegmentsToBuckets(
  cols: ColumnSegment[],
  anchors: number[],
): PositionedGlyphRun[][][] {
  // Each cell holds an array of lines (each line is PositionedGlyphRun[])
  const buckets: PositionedGlyphRun[][][] = Array.from({ length: anchors.length }, () => []);
  for (const seg of cols) {
    let bestCol = 0;
    let bestDist = Infinity;
    anchors.forEach((anchor, cIdx) => {
      const d = Math.abs(seg.minX - anchor);
      if (d < bestDist) {
        bestDist = d;
        bestCol = cIdx;
      }
    });
    buckets[bestCol].push(seg.runs);
  }
  return buckets;
}

function buildStructuredPageHtml(
  lines: VisualLine[],
  pageWidth: number,
  bodyFontSize: number,
): string {
  if (lines.length === 0) return '';

  const contentLeft = Math.max(24, Math.min(...lines.map((l) => l.minX)));
  const contentRight = Math.min(pageWidth - 24, Math.max(...lines.map((l) => l.maxX)));

  const htmlBlocks: string[] = [];
  let idx = 0;

  while (idx < lines.length) {
    const line = lines[idx];
    const cols = splitLineIntoColumns(line);

    // 1) Detect multi-row Table (including wrapped multi-line cells inside columns!)
    // Require >= 3 columns on header row OR (>= 2 consecutive multi-col rows with >= 3 columns somewhere)
    if (cols.length >= 3 || (cols.length >= 2 && idx + 1 < lines.length && splitLineIntoColumns(lines[idx + 1]).length >= 3)) {
      // Collect initial seed lines to discover column X anchors
      const seedRows: ColumnSegment[][] = [cols];
      let probe = idx + 1;
      while (probe < lines.length && seedRows.length < 4) {
        const nextCols = splitLineIntoColumns(lines[probe]);
        const yGap = lines[probe - 1].y - lines[probe].y;
        if (nextCols.length >= 2 && yGap < bodyFontSize * 4.5) {
          seedRows.push(nextCols);
          probe += 1;
        } else {
          break;
        }
      }

      const anchors: number[] = [];
      for (const sRow of seedRows) {
        for (const seg of sRow) {
          const foundIdx = anchors.findIndex((a) => Math.abs(a - seg.minX) < 52);
          if (foundIdx === -1) {
            anchors.push(seg.minX);
          } else {
            anchors[foundIdx] = Math.min(anchors[foundIdx], seg.minX);
          }
        }
      }
      anchors.sort((a, b) => a - b);

      if (anchors.length >= 2) {
        const logicalRows: PositionedGlyphRun[][][][] = [assignSegmentsToBuckets(cols, anchors)];
        let lastY = line.y;
        let lookahead = idx + 1;

        while (lookahead < lines.length) {
          const candLine = lines[lookahead];
          const yGap = lastY - candLine.y;
          if (yGap > bodyFontSize * 4.8 || candLine.maxFontSize >= bodyFontSize * 1.24) {
            break;
          }

          const candCols = splitLineIntoColumns(candLine);
          if (!matchesColumnAnchors(candCols, anchors)) {
            break;
          }

          const candBuckets = assignSegmentsToBuckets(candCols, anchors);
          const hasFirstCol = candBuckets[0].length > 0;
          const isContinuationOfCurrentRow =
            logicalRows.length >= 2 &&
            !hasFirstCol &&
            yGap <= bodyFontSize * 2.1;

          if (isContinuationOfCurrentRow) {
            const currentRow = logicalRows[logicalRows.length - 1];
            candBuckets.forEach((cellLines, cIdx) => {
              currentRow[cIdx].push(...cellLines);
            });
          } else if (candCols.length >= 2) {
            logicalRows.push(candBuckets);
          } else {
            break;
          }

          lastY = candLine.y;
          lookahead += 1;
        }

        if (logicalRows.length >= 2) {
          const rowsHtml = logicalRows.map((rowBuckets, rIdx) => {
            const cellTag = rIdx === 0 ? 'th' : 'td';
            const cellsHtml = rowBuckets
              .map((cellLines) => {
                const joinedCell = cellLines
                  .map((lineRuns) => joinRunsIntoRichHtml(lineRuns, bodyFontSize))
                  .filter(Boolean)
                  .map((lineHtml, lIdx, arr) => {
                    if (lIdx === 0) return lineHtml;
                    const prevText = arr[lIdx - 1].replace(/<[^>]+>/g, '');
                    const curText = lineHtml.replace(/<[^>]+>/g, '');
                    const bothThai =
                      /[\u0e00-\u0e7f]$/.test(prevText) && /^[\u0e00-\u0e7f]/.test(curText);
                    return (bothThai ? '' : ' ') + lineHtml;
                  })
                  .join('');
                return `<${cellTag}><p>${joinedCell}</p></${cellTag}>`;
              })
              .join('');
            return `<tr>${cellsHtml}</tr>`;
          });

          htmlBlocks.push(
            `<table><thead>${rowsHtml[0]}</thead><tbody>${rowsHtml.slice(1).join('')}</tbody></table>`,
          );
          idx = lookahead;
          continue;
        }
      }
    }

    // 2) Heading detection by relative font size
    const plainLine = joinRunsPlainText(line.runs);
    if (!plainLine) {
      idx += 1;
      continue;
    }

    const align = detectAlignment(line, contentLeft, contentRight);
    const alignAttr = align !== 'left' ? ` style="text-align: ${align}"` : '';

    if (line.maxFontSize >= bodyFontSize * 1.48 && plainLine.length < 180) {
      htmlBlocks.push(`<h1${alignAttr}>${joinRunsIntoRichHtml(line.runs, line.maxFontSize)}</h1>`);
      idx += 1;
      continue;
    }

    if (line.maxFontSize >= bodyFontSize * 1.24 && plainLine.length < 200) {
      htmlBlocks.push(`<h2${alignAttr}>${joinRunsIntoRichHtml(line.runs, line.maxFontSize)}</h2>`);
      idx += 1;
      continue;
    }

    if (
      line.maxFontSize >= bodyFontSize * 1.12 &&
      line.runs.filter((r) => r.str.trim()).every((r) => r.bold) &&
      plainLine.length < 160
    ) {
      htmlBlocks.push(`<h3${alignAttr}>${joinRunsIntoRichHtml(line.runs, line.maxFontSize)}</h3>`);
      idx += 1;
      continue;
    }

    // 3) Bullet or Numbered List detection
    const bulletMatch = plainLine.match(/^[•●▪◦\-–]\s+(.+)$/);
    if (bulletMatch) {
      const items: string[] = [];
      while (idx < lines.length) {
        const curPlain = joinRunsPlainText(lines[idx].runs);
        const m = curPlain.match(/^[•●▪◦\-–]\s+(.+)$/);
        if (!m) break;
        const rich = joinRunsIntoRichHtml(lines[idx].runs, bodyFontSize).replace(
          /^(\s*<[^>]+>)*[•●▪◦\-–]\s+/,
          '$1',
        );
        items.push(`<li><p>${rich}</p></li>`);
        idx += 1;
      }
      htmlBlocks.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    const orderedMatch = plainLine.match(/^(\d+)[.)]\s+(.+)$/);
    if (orderedMatch) {
      const items: string[] = [];
      while (idx < lines.length) {
        const curPlain = joinRunsPlainText(lines[idx].runs);
        const m = curPlain.match(/^(\d+)[.)]\s+(.+)$/);
        if (!m) break;
        const rich = joinRunsIntoRichHtml(lines[idx].runs, bodyFontSize).replace(
          /^(\s*<[^>]+>)*\d+[.)]\s+/,
          '$1',
        );
        items.push(`<li><p>${rich}</p></li>`);
        idx += 1;
      }
      htmlBlocks.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    // 4) Single-line 2-part metadata (e.g. "ส่วนงาน: ...   โทร. ..." or "ที่: ...   วันที่: ...")
    if (cols.length >= 2) {
      const combinedCols = cols
        .map((c) => joinRunsIntoRichHtml(c.runs, bodyFontSize))
        .join(' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ');
      htmlBlocks.push(`<p${alignAttr}>${combinedCols}</p>`);
      idx += 1;
      continue;
    }

    // 5) Merge consecutive wrapped body lines into a clean editable paragraph
    const paraLineHtmls: string[] = [joinRunsIntoRichHtml(line.runs, bodyFontSize)];
    let cursor = idx + 1;
    while (cursor < lines.length) {
      const prevLine = lines[cursor - 1];
      const candidate = lines[cursor];
      const yDelta = prevLine.y - candidate.y;
      const candidateCols = splitLineIntoColumns(candidate);
      const candidatePlain = joinRunsPlainText(candidate.runs);
      const candidateAlign = detectAlignment(candidate, contentLeft, contentRight);

      const isSameParagraph =
        align === 'left' &&
        candidateAlign === 'left' &&
        candidateCols.length === 1 &&
        yDelta > 0 &&
        yDelta <= prevLine.avgFontSize * 1.78 &&
        Math.abs(candidate.avgFontSize - prevLine.avgFontSize) < 1.5 &&
        candidate.maxFontSize < bodyFontSize * 1.22 &&
        Math.abs(candidate.minX - prevLine.minX) < 32 &&
        prevLine.maxX > contentRight - (contentRight - contentLeft) * 0.28 &&
        !/^([•●▪◦\-–]|\d+[.)])\s+/.test(candidatePlain);

      if (!isSameParagraph) break;

      const nextPiece = joinRunsIntoRichHtml(candidate.runs, bodyFontSize);
      const prevPlain = joinRunsPlainText(prevLine.runs);
      const lastCh = prevPlain[prevPlain.length - 1] || '';
      const firstCh = candidatePlain[0] || '';
      const bothThai = /[\u0e00-\u0e7f]/.test(lastCh) && /[\u0e00-\u0e7f]/.test(firstCh);
      paraLineHtmls.push((bothThai ? '' : ' ') + nextPiece);
      cursor += 1;
    }

    htmlBlocks.push(`<p${alignAttr}>${paraLineHtmls.join('')}</p>`);
    idx = cursor;
  }

  return htmlBlocks.join('\n');
}

export async function extractPdfToEditableDocument(file: File): Promise<PdfImportResult> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;

  let detectedPageSize: PageSize = 'A4';
  let detectedOrientation: PageOrientation = 'portrait';
  let usedImageFallbackPages = 0;
  const pageHtmlFragments: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });

    if (pageNum === 1) {
      detectedOrientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
      const shortSide = Math.min(viewport.width, viewport.height);
      detectedPageSize = Math.abs(shortSide - 612) < 10 ? 'Letter' : 'A4';
    }

    const textContent = await page.getTextContent();
    const styles = (textContent.styles || {}) as Record<
      string,
      { fontFamily?: string; ascent?: number; descent?: number }
    >;

    const rawRuns: PositionedGlyphRun[] = [];

    for (const item of textContent.items) {
      if (!('str' in item)) continue;
      const textStr = item.str;
      if (!textStr || !textStr.replace(/\u0000/g, '').trim()) continue;

      const tx = item.transform;
      const fontSize = Math.max(
        6,
        Math.round(Math.hypot(tx[2] || 0, tx[3] || item.height || 12) * 10) / 10,
      );
      const x = tx[4] || 0;
      const y = tx[5] || 0;
      const styleInfo = styles[item.fontName] || {};
      const fontMeta = `${item.fontName || ''} ${styleInfo.fontFamily || ''}`.toLowerCase();
      const bold = /bold|black|heavy|demi|semibold|600|700|800/.test(fontMeta);
      const italic = /italic|oblique/.test(fontMeta);

      rawRuns.push({
        str: textStr,
        x,
        y,
        width: item.width || 0,
        height: item.height || fontSize,
        fontSize,
        bold,
        italic,
      });
    }

    const sortedByY = [...rawRuns].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: VisualLine[] = [];

    for (const run of sortedByY) {
      const cleaned = repairThaiPdfString(run.str);
      if (!cleaned.trim()) continue;

      const tolerance = Math.max(4.2, run.fontSize * 0.48);
      const existingLine = lines.find((l) => Math.abs(l.y - run.y) <= tolerance);
      if (existingLine) {
        existingLine.runs.push(run);
        if (!isThaiCombiningChar(cleaned[0] || '')) {
          existingLine.y =
            (existingLine.y * (existingLine.runs.length - 1) + run.y) / existingLine.runs.length;
        }
        existingLine.minX = Math.min(existingLine.minX, run.x);
        existingLine.maxX = Math.max(existingLine.maxX, run.x + Math.max(run.width, 2));
        existingLine.maxFontSize = Math.max(existingLine.maxFontSize, run.fontSize);
        existingLine.avgFontSize =
          existingLine.runs.reduce((acc, r) => acc + r.fontSize, 0) / existingLine.runs.length;
      } else {
        lines.push({
          y: run.y,
          minX: run.x,
          maxX: run.x + Math.max(run.width, 2),
          avgFontSize: run.fontSize,
          maxFontSize: run.fontSize,
          runs: [run],
        });
      }
    }

    lines.sort((a, b) => b.y - a.y);

    if (rawRuns.length === 0) {
      const dataUrl = await renderPageAsHighResPng(page);
      if (dataUrl) {
        usedImageFallbackPages += 1;
        pageHtmlFragments.push(
          `<p><img src="${dataUrl}" alt="หน้าที่ ${pageNum} (ภาพสแกนจาก PDF)" width="620" /></p>`,
        );
      }
    } else {
      const bodyFontSize = median(rawRuns.map((r) => r.fontSize));
      const pageHtml = buildStructuredPageHtml(lines, viewport.width, bodyFontSize);
      if (pageHtml.trim()) {
        pageHtmlFragments.push(pageHtml);
      }
    }

    if (pageNum < pdf.numPages) {
      pageHtmlFragments.push('<hr data-page-break="true" class="fw-page-break" />');
    }
  }

  return {
    html: pageHtmlFragments.join('\n') || '<p></p>',
    pageSize: detectedPageSize,
    orientation: detectedOrientation,
    pageCount: pdf.numPages,
    usedImageFallbackPages,
  };
}
