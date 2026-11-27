import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PageOrientation, PageSize } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface PdfImportResult {
  html: string;
  pageSize: PageSize;
  orientation: PageOrientation;
  pageCount: number;
  extractedImageCount: number;
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

interface ExtractedPdfImage {
  dataUrl: string;
  x: number;
  yTop: number;
  yBottom: number;
  widthPt: number;
  heightPt: number;
  align: 'left' | 'center' | 'right';
}

interface ColumnSegment {
  minX: number;
  maxX: number;
  runs: PositionedGlyphRun[];
  text: string;
}

const THAI_PUA_MAP: Record<number, string> = {
  0xf700: '\u0e10',
  0xf701: '\u0e34',
  0xf702: '\u0e35',
  0xf703: '\u0e36',
  0xf704: '\u0e37',
  0xf705: '\u0e48',
  0xf706: '\u0e49',
  0xf707: '\u0e4a',
  0xf708: '\u0e4b',
  0xf709: '\u0e4c',
  0xf70a: '\u0e48',
  0xf70b: '\u0e49',
  0xf70c: '\u0e4a',
  0xf70d: '\u0e4b',
  0xf70e: '\u0e4c',
  0xf70f: '\u0e0d',
  0xf710: '\u0e31',
  0xf711: '\u0e4d',
  0xf712: '\u0e47',
  0xf713: '\u0e48',
  0xf714: '\u0e49',
  0xf715: '\u0e4a',
  0xf716: '\u0e4b',
  0xf717: '\u0e4c',
  0xf718: '\u0e38',
  0xf719: '\u0e39',
  0xf71a: '\u0e3a',
};

export function repairThaiPdfString(raw: string): string {
  if (!raw) return '';

  let s = '';
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (THAI_PUA_MAP[code]) {
      s += THAI_PUA_MAP[code];
    } else {
      s += raw[i];
    }
  }

  s = s.replace(/([\u0e40\u0e41][\u0e01-\u0e2e])\u0000/g, '$1\u0e47');
  s = s.replace(/(นี|ขึ|ตั|ทั|นั|ยั|ชั|ขั|สั|มั|รั|ลั)\u0000/g, '$1\u0e49');
  s = s.replace(/([\u0e31\u0e34-\u0e37])\u0000/g, '$1\u0e48');
  s = s.replace(/([\u0e1b\u0e1d\u0e1f\u0e2c])\u0000/g, '$1\u0e48');
  s = s.replace(/([\u0e01-\u0e2e])\u0000/g, '$1\u0e48');
  s = s.replace(/\u0000/g, '');

  s = s
    .normalize('NFKC')
    .replace(/\u0e4d\u0e32/g, '\u0e33')
    .replace(/([\u0e48-\u0e4b])\u0e4d\u0e32/g, '$1\u0e33');

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

type Matrix2D = [number, number, number, number, number, number];

function multiplyMatrices(m1: Matrix2D, m2: Matrix2D): Matrix2D {
  return [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
}

function transformPoint(m: Matrix2D, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/**
 * Extracts embedded images from a PDF page by rendering the page once at high resolution,
 * reading the operator list bounding boxes (paintImageXObject / paintInlineImageXObject),
 * and cropping each non-background image region cleanly into a standalone PNG Data URL!
 */
async function extractEmbeddedImagesFromPage(
  page: pdfjsLib.PDFPageProxy,
  pageWidthPt: number,
  pageHeightPt: number,
): Promise<ExtractedPdfImage[]> {
  try {
    const opList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;

    const candidateBoxes: Array<{
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    }> = [];

    const matrixStack: Matrix2D[] = [];
    let ctm: Matrix2D = [1, 0, 0, 1, 0, 0];

    for (let i = 0; i < opList.fnArray.length; i += 1) {
      const fn = opList.fnArray[i];
      const args = opList.argsArray[i];

      if (fn === OPS.save) {
        matrixStack.push([...ctm] as Matrix2D);
      } else if (fn === OPS.restore) {
        ctm = matrixStack.pop() || [1, 0, 0, 1, 0, 0];
      } else if (fn === OPS.transform && Array.isArray(args) && args.length >= 6) {
        const nextM: Matrix2D = [
          Number(args[0]),
          Number(args[1]),
          Number(args[2]),
          Number(args[3]),
          Number(args[4]),
          Number(args[5]),
        ];
        ctm = multiplyMatrices(ctm, nextM);
      } else if (
        fn === OPS.paintImageXObject ||
        fn === OPS.paintInlineImageXObject ||
        fn === OPS.paintImageXObjectRepeat
      ) {
        // PDF images are painted onto the [0,1]x[0,1] unit square transformed by CTM
        const corners = [
          transformPoint(ctm, 0, 0),
          transformPoint(ctm, 1, 0),
          transformPoint(ctm, 0, 1),
          transformPoint(ctm, 1, 1),
        ];
        const xs = corners.map((p) => p[0]);
        const ys = corners.map((p) => p[1]);
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(pageWidthPt, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(pageHeightPt, Math.max(...ys));
        const wPt = maxX - minX;
        const hPt = maxY - minY;

        // Ignore tiny decorative 1px/line artifacts (< 16pt) and full-page solid white backgrounds (> 96% of page)
        const isTinyArtifact = wPt < 16 || hPt < 16;
        const isFullPageBg = wPt > pageWidthPt * 0.96 && hPt > pageHeightPt * 0.96;

        if (!isTinyArtifact && !isFullPageBg) {
          // Deduplicate overlapping identical boxes
          const duplicate = candidateBoxes.some(
            (b) =>
              Math.abs(b.minX - minX) < 4 &&
              Math.abs(b.maxX - maxX) < 4 &&
              Math.abs(b.minY - minY) < 4 &&
              Math.abs(b.maxY - maxY) < 4,
          );
          if (!duplicate) {
            candidateBoxes.push({ minX, maxX, minY, maxY });
          }
        }
      }
    }

    if (candidateBoxes.length === 0) {
      return [];
    }

    // Render page at 2x resolution onto an offscreen canvas so we can crop crisp images
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = Math.ceil(viewport.width);
    fullCanvas.height = Math.ceil(viewport.height);
    const ctx = fullCanvas.getContext('2d');
    if (!ctx) return [];
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);
    await page.render({ canvasContext: ctx, viewport, canvas: fullCanvas }).promise;

    const extracted: ExtractedPdfImage[] = [];
    for (const box of candidateBoxes) {
      const [vx1, vy1] = viewport.convertToViewportPoint(box.minX, box.maxY);
      const [vx2, vy2] = viewport.convertToViewportPoint(box.maxX, box.minY);
      const sx = Math.max(0, Math.floor(Math.min(vx1, vx2)));
      const sy = Math.max(0, Math.floor(Math.min(vy1, vy2)));
      const sw = Math.min(fullCanvas.width - sx, Math.ceil(Math.abs(vx2 - vx1)));
      const sh = Math.min(fullCanvas.height - sy, Math.ceil(Math.abs(vy2 - vy1)));
      if (sw < 16 || sh < 16) continue;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) continue;
      cropCtx.drawImage(fullCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

      const boxCenter = (box.minX + box.maxX) / 2;
      const pageCenter = pageWidthPt / 2;
      const align: 'left' | 'center' | 'right' =
        Math.abs(boxCenter - pageCenter) <= pageWidthPt * 0.12
          ? 'center'
          : boxCenter > pageCenter
            ? 'right'
            : 'left';

      extracted.push({
        dataUrl: cropCanvas.toDataURL('image/png'),
        x: box.minX,
        yTop: box.maxY,
        yBottom: box.minY,
        widthPt: Math.round((box.maxX - box.minX) * 1.25), // convert PDF 72dpi pt to ~96dpi CSS px
        heightPt: Math.round((box.maxY - box.minY) * 1.25),
        align,
      });
    }

    extracted.sort((a, b) => b.yTop - a.yTop);
    return extracted;
  } catch {
    return [];
  }
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

function renderExtractedImgHtml(img: ExtractedPdfImage, index: number): string {
  const safeW = Math.max(80, Math.min(620, img.widthPt));
  return `<img src="${img.dataUrl}" alt="รูปภาพจาก PDF #${index + 1}" width="${safeW}" data-align="${img.align}" data-rounded="true" />`;
}

function buildStructuredPageHtml(
  lines: VisualLine[],
  images: ExtractedPdfImage[],
  pageWidth: number,
  bodyFontSize: number,
): string {
  if (lines.length === 0 && images.length === 0) return '';

  const contentLeft =
    lines.length > 0 ? Math.max(24, Math.min(...lines.map((l) => l.minX))) : 48;
  const contentRight =
    lines.length > 0 ? Math.min(pageWidth - 24, Math.max(...lines.map((l) => l.maxX))) : pageWidth - 48;

  const htmlBlocks: string[] = [];
  let idx = 0;
  let imgIdx = 0;

  const flushImagesAboveY = (yThreshold: number) => {
    while (imgIdx < images.length && images[imgIdx].yBottom >= yThreshold - 8) {
      htmlBlocks.push(renderExtractedImgHtml(images[imgIdx], imgIdx));
      imgIdx += 1;
    }
  };

  while (idx < lines.length) {
    const line = lines[idx];
    flushImagesAboveY(line.y);

    const cols = splitLineIntoColumns(line);

    // 1) Detect multi-row Table
    if (
      cols.length >= 3 ||
      (cols.length >= 2 && idx + 1 < lines.length && splitLineIntoColumns(lines[idx + 1]).length >= 3)
    ) {
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
            logicalRows.length >= 2 && !hasFirstCol && yGap <= bodyFontSize * 2.1;

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

    // 4) Single-line 2-part metadata
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

      // Do not merge across an embedded image sitting between prevLine and candidate!
      const hasImageBetween =
        imgIdx < images.length &&
        images[imgIdx].yTop <= prevLine.y + 4 &&
        images[imgIdx].yBottom >= candidate.y - 4;

      const isSameParagraph =
        !hasImageBetween &&
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

  // Flush any remaining images positioned below the last line of text
  while (imgIdx < images.length) {
    htmlBlocks.push(renderExtractedImgHtml(images[imgIdx], imgIdx));
    imgIdx += 1;
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
  let extractedImageCount = 0;
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

    const [textContent, pageImages] = await Promise.all([
      page.getTextContent(),
      extractEmbeddedImagesFromPage(page, viewport.width, viewport.height),
    ]);
    extractedImageCount += pageImages.length;

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

    if (rawRuns.length === 0 && pageImages.length === 0) {
      const dataUrl = await renderPageAsHighResPng(page);
      if (dataUrl) {
        usedImageFallbackPages += 1;
        pageHtmlFragments.push(
          `<img src="${dataUrl}" alt="หน้าที่ ${pageNum} (ภาพสแกนจาก PDF)" width="620" data-align="center" data-rounded="false" />`,
        );
      }
    } else {
      const bodyFontSize = rawRuns.length > 0 ? median(rawRuns.map((r) => r.fontSize)) : 12;
      const pageHtml = buildStructuredPageHtml(lines, pageImages, viewport.width, bodyFontSize);
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
    extractedImageCount,
    usedImageFallbackPages,
  };
}
