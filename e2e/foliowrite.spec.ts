import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

test.describe('FolioWrite Cross-Device E2E Flows (replica-test)', () => {
  test('F01 + F03 + F05: Home -> Create from Template -> Edit, Table, Find/Replace, Export .docx & Screenshots', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'FolioWrite', exact: true })).toBeVisible();
    await expect(page.getByText('คู่มือเริ่มต้นใช้งาน FolioWrite (ข้ามอุปกรณ์)').first()).toBeVisible();

    const screenshotDir = path.resolve('replica/clone-screens');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'S01-desktop.png') });

    // Create a new document from Thai Memo template
    await page.locator('#tpl-thai-memo').click();
    await expect(page.locator('#input-doc-title')).toHaveValue('บันทึกข้อความภายใน');

    // Type additional content & apply bold
    const editorArea = page.locator('.tiptap');
    await editorArea.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('ข้อความทดสอบอัตโนมัติสำหรับตรวจสอบการนับคำภาษาไทยและตาราง');

    // Switch to Insert tab and insert a 2x2 table
    await page.locator('#ribbon-tab-insert').click();
    await page.locator('#btn-insert-table').click();
    await page.locator('#input-table-rows').fill('2');
    await page.locator('#input-table-cols').fill('2');
    await page.locator('#btn-confirm-insert-table').click();

    // Verify Outline Pane on View tab
    await page.locator('#ribbon-tab-view').click();
    if (!(await page.getByLabel('สารบัญเอกสาร').isVisible())) {
      await page.locator('#btn-toggle-outline').click();
    }
    await expect(page.getByLabel('สารบัญเอกสาร')).toBeVisible();

    // Switch back to Home tab and capture S02 desktop editor screenshot
    await page.locator('#ribbon-tab-home').click();
    await page.screenshot({ path: path.join(screenshotDir, 'S02-desktop.png') });

    // F05: Find & Replace
    await page.locator('#btn-find-toggle').click();
    await page.locator('#input-find-query').fill('ข้อความทดสอบอัตโนมัติ');
    await page.locator('#input-replace-query').fill('เนื้อหาผ่านการตรวจสอบแล้ว');
    await page.locator('#btn-replace-all').click();
    await expect(editorArea).toContainText('เนื้อหาผ่านการตรวจสอบแล้ว');

    // F03: Export .docx download verification + F02 round-trip re-import!
    await page.locator('#btn-file-export').click();
    await page.screenshot({ path: path.join(screenshotDir, 'S03-export-modal.png') });

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-docx').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('บันทึกข้อความภายใน.docx');

    const tempDocxPath = path.join('/tmp', `roundtrip-${Date.now()}.docx`);
    await download.saveAs(tempDocxPath);
    const stat = fs.statSync(tempDocxPath);
    expect(stat.size).toBeGreaterThan(1000);

    // Return Home and verify persistence + search + folder creation + .docx import
    await page.locator('#btn-back-home').click();
    await expect(page.getByRole('heading', { name: /เอกสารทั้งหมด/ })).toBeVisible();

    // F04: Create Folder
    await page.locator('#btn-open-folder-modal').click();
    await page.locator('#input-new-folder-name').fill('ฝ่ายบริหาร');
    await page.locator('#btn-submit-folder').click();
    await expect(page.getByRole('button', { name: /ฝ่ายบริหาร/ })).toBeVisible();

    // F04: Search
    await page.locator('#input-search-docs').fill('เนื้อหาผ่านการตรวจสอบแล้ว');
    await expect(page.getByText('บันทึกข้อความภายใน').first()).toBeVisible();
    await page.locator('#input-search-docs').fill('');

    // F02: Import the exported .docx file back into FolioWrite!
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.locator('#btn-import-doc').click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempDocxPath);

    await expect(page.locator('.tiptap')).toContainText('เนื้อหาผ่านการตรวจสอบแล้ว');
    expect(errors).toEqual([]);
  });

  test('Mobile Viewport (390x844): Full Paper Sheet Visible Edge-to-Edge & Zero Horizontal Overflow', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto('/');

    // Verify pure white background on Home
    const homeBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(homeBg).toBe('rgb(255, 255, 255)');

    const screenshotDir = path.resolve('replica/clone-screens');
    await page.screenshot({ path: path.join(screenshotDir, 'S01-mobile.png') });

    // Open Thai Memo template on 390px phone so we can visually inspect the FULL scaled A4 sheet
    await page.locator('#tpl-thai-memo').click();

    // Verify FULL A4 Portrait sheet (.fw-sheet--a4-portrait) is visible and scaled to fit <= 390px!
    const sheet = page.locator('.fw-sheet--a4-portrait');
    await expect(sheet).toBeVisible();
    await expect(page.getByRole('toolbar', { name: 'แถบเครื่องมือด่วนบนมือถือ' })).toBeVisible();

    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(391);

    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth + 2;
    });
    expect(hasHorizontalOverflow).toBe(false);

    await page.screenshot({ path: path.join(screenshotDir, 'S02-mobile.png') });
    await context.close();
  });

  test('PDF Import & PDF-to-DOCX Conversion: Embedded Images, Thai glyphs, Headings & Tables stay intact and editable', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.locator('#tpl-thai-memo').click();
    await expect(page.locator('.tiptap')).toContainText('บันทึกข้อความ');

    // Insert a real raster PNG image (src/assets/hero.png) BEFORE printing to PDF so the PDF contains an embedded raster image!
    const rasterImgPath = path.resolve('src/assets/hero.png');
    await page.locator('#input-editor-image').setInputFiles(rasterImgPath);
    await expect(page.locator('.tiptap img:not(.ProseMirror-separator)').first()).toBeVisible();

    // Generate a real vector + raster-image PDF
    const samplePdfPath = path.join('/tmp', `sample-thai-img-${Date.now()}.pdf`);
    await page.pdf({
      path: samplePdfPath,
      format: 'A4',
      printBackground: true,
    });
    await page.emulateMedia({ media: 'screen' });
    expect(fs.statSync(samplePdfPath).size).toBeGreaterThan(5000);

    // Navigate cleanly to Home and convert the PDF (text + table + image!)
    await page.goto('/');
    await expect(page.locator('#btn-convert-pdf-docx')).toBeVisible();
    await page.locator('#input-pdf-to-docx').setInputFiles(samplePdfPath);

    // 1) Verify editor opened the converted PDF with 100% intact Thai words, table cells, AND extracted image!
    await expect(page.locator('#input-doc-title')).toHaveValue(/sample-thai-img-/);
    const editor = page.locator('.tiptap');
    await expect(editor).toContainText('บันทึกข้อความ');
    await expect(editor).toContainText('ความเป็นมาและวัตถุประสงค์');
    await expect(editor).toContainText('ขออนุมัติแนวทางการจัดทำเอกสารมาตรฐานรูปแบบดิจิทัล');
    await expect(editor).toContainText('จัดเตรียมแม่แบบเอกสารหลักประจำฝ่าย');
    await expect(editor).toContainText('ทีมเทคโนโลยีสารสนเทศ');
    await expect(editor.locator('table').first()).toBeVisible();
    await expect(editor.locator('img:not(.ProseMirror-separator)').first()).toBeVisible();

    // 2) Edit the converted PDF document directly to confirm full editability
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('แก้ไขเพิ่มเติมหลังแปลงจากไฟล์ PDF พร้อมรูปภาพสำเร็จ');
    await expect(editor).toContainText('แก้ไขเพิ่มเติมหลังแปลงจากไฟล์ PDF พร้อมรูปภาพสำเร็จ');

    // 3) Export the edited PDF-converted document (including its extracted image!) to .docx and re-import
    await page.locator('#btn-file-export').click();
    const docxDownloadPromise = page.waitForEvent('download');
    await page.locator('#btn-export-docx').click();
    const docxDownload = await docxDownloadPromise;
    expect(docxDownload.suggestedFilename()).toMatch(/\.docx$/);

    const convertedDocxPath = path.join('/tmp', `converted-from-pdf-${Date.now()}.docx`);
    await docxDownload.saveAs(convertedDocxPath);
    expect(fs.statSync(convertedDocxPath).size).toBeGreaterThan(3000);

    await page.locator('#btn-back-home').click();
    await page.locator('#input-import-file').setInputFiles(convertedDocxPath);

    await expect(page.locator('.tiptap')).toContainText('บันทึกข้อความ');
    await expect(page.locator('.tiptap')).toContainText('จัดเตรียมแม่แบบเอกสารหลักประจำฝ่าย');
    await expect(page.locator('.tiptap')).toContainText('แก้ไขเพิ่มเติมหลังแปลงจากไฟล์ PDF พร้อมรูปภาพสำเร็จ');
    await expect(page.locator('.tiptap img:not(.ProseMirror-separator)').first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('White Theme, Collapsible Templates, Floating Pill Dock, Image Inspector & New Page Repeating Header', async ({
    page,
  }) => {
    await page.goto('/');
    const screenshotDir = path.resolve('replica/clone-screens');
    fs.mkdirSync(screenshotDir, { recursive: true });

    // 1) Collapse the Template Gallery and verify compact quick-pills appear
    await expect(page.locator('.fw-template-grid')).toBeVisible();
    await page.locator('#btn-toggle-templates').click();
    await expect(page.locator('.fw-template-grid')).toHaveCount(0);
    await expect(page.locator('#tpl-quick-blank')).toBeVisible();
    await page.screenshot({ path: path.join(screenshotDir, 'S01-collapsed-templates.png') });

    // Create doc from Thai Memo quick-pill
    await page.locator('#tpl-quick-thai-memo').click();

    // 2) Set custom Running Header on Sheet 1 ("บริษัท โฟลิโอ จำกัด — เอกสารภายใน")
    const headerInput = page.locator('#input-running-header');
    await expect(headerInput).toBeVisible();
    await headerInput.fill('บริษัท โฟลิโอ จำกัด — เอกสารภายใน');

    // 3) Insert a Page Break ("ขึ้นหน้าใหม่") and verify Page 2 displays the physical page gap + repeating header!
    await page.locator('.tiptap').click();
    await page.keyboard.press('End');
    await page.locator('#ribbon-tab-insert').click();
    await page.locator('#btn-insert-pagebreak').click();
    await page.keyboard.type('เนื้อหาในแผ่นที่ 2 ต่อเนื่องจากแผ่นแรก พร้อมหัวกระดาษซ้ำอัตโนมัติ');

    const pageBreakEl = page.locator('.fw-page-break').first();
    await expect(pageBreakEl).toBeVisible();
    const titleBefore = await page
      .locator('.fw-page-break__title')
      .first()
      .evaluate((el) => getComputedStyle(el, '::before').getPropertyValue('content'));
    expect(titleBefore).toContain('บริษัท โฟลิโอ จำกัด');

    await pageBreakEl.scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(screenshotDir, 'S02-new-page-header.png') });

    // 4) Insert an image via "+ รูปภาพ" and verify Image Inspector Pill
    await page.locator('#btn-quick-image').click();
    const iconSvgPath = path.resolve('public/foliowrite-icon.svg');
    await page.locator('#input-editor-image').setInputFiles(iconSvgPath);

    const insertedImg = page.locator('.tiptap img:not(.ProseMirror-separator)').first();
    await expect(insertedImg).toBeVisible();
    await insertedImg.click();
    await expect(page.getByRole('toolbar', { name: 'ปรับแต่งรูปภาพ' })).toBeVisible();
    await page.locator('#btn-img-size-sm').click();
    await page.locator('#btn-img-align-center').click();

    await page.screenshot({ path: path.join(screenshotDir, 'S02-floating-dock-image.png') });
  });
});
