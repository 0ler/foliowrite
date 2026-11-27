import type { TextMetrics } from '../types';

export function htmlToPlainText(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.innerText || doc.body.textContent || '').trim();
}

export function countWordsBilingual(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
    let count = 0;
    for (const seg of segmenter.segment(trimmed)) {
      if (seg.isWordLike) {
        count += 1;
      }
    }
    return count;
  }

  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function computeTextMetrics(html: string): TextMetrics {
  const doc = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
  const plainText = (doc.body.innerText || doc.body.textContent || '').trim();
  const words = countWordsBilingual(plainText);
  const characters = plainText.length;
  const charactersNoSpaces = plainText.replace(/\s+/g, '').length;

  const blockElements = doc.body.querySelectorAll('p, h1, h2, h3, li, blockquote');
  let paragraphs = 0;
  blockElements.forEach((el) => {
    if ((el.textContent || '').trim().length > 0) {
      paragraphs += 1;
    }
  });

  const explicitPageBreaks = doc.body.querySelectorAll('hr[data-page-break="true"], .fw-page-break').length;
  const wordBasedPages = Math.max(1, Math.ceil(Math.max(words, 1) / 320));
  const estimatedPages = Math.max(wordBasedPages, explicitPageBreaks + 1);
  const readingMinutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));

  return {
    words,
    characters,
    charactersNoSpaces,
    paragraphs,
    estimatedPages,
    readingMinutes,
  };
}

export function formatRelativeDate(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'เมื่อสักครู่';
    if (diffMins < 60) return `${diffMins} นาทีที่แล้ว`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`;
    return date.toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}
