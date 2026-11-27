# Test Plan (`replica-test`)

| Case ID | Flow | Scenario | Viewport | Status |
| --- | --- | --- | --- | --- |
| F01-H1 | F01 Create & Format | Create from `บันทึกข้อความภายใน` template, type Thai text, verify live word count & IndexedDB auto-save | 1440×900 | PASS |
| F01-E1 | F01 React StrictMode | Ensure seed workspace only populates once under StrictMode double-mount | 1440×900 | PASS |
| F02-H1 | F02 Import `.docx` | Re-import exported `.docx` file via file picker and verify preserved Thai body text & structure | 1440×900 | PASS |
| F03-H1 | F03 Export `.docx` | Open File/Export modal, download `.docx` OpenXML archive (>1 KB valid zip/docx) | 1440×900 | PASS |
| F04-H1 | F04 Folders & Search | Create folder `ฝ่ายบริหาร`, search full-text Thai phrase, verify matching card | 1440×900 | PASS |
| F05-H1 | F05 Find & Replace + Outline | Open Find bar, replace Thai phrase across document/table cells, toggle Outline pane | 1440×900 | PASS |
| MOB-H1 | Cross-device Mobile | Open on 390×844 touch viewport, open drawer, create blank doc, verify Mobile Reflow + Sticky Bottom Bar + 0px horizontal overflow | 390×844 | PASS |
