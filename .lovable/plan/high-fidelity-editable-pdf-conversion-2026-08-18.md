# High-fidelity editable PDF conversion

## Goal
Convert PDF pages into editable PowerPoint and Word content while preserving page geometry, tables, borders, shading, fonts, and Devanagari text as closely as the source permits.

## Implementation
1. **Create a shared document-layout model**
   - Represent OCR output as pages containing text runs, paragraphs, table cells, lines, rectangles, images, and confidence/language metadata.
   - Normalize native PDF text, Tesseract output, PaddleOCR output, and Docling output into this model.

2. **Add a real OCR pipeline**
   - Use the PDF’s Unicode text layer when it is reliable.
   - Run browser-based Tesseract for scanned or unmapped text, including English, Hindi, and Marathi/Devanagari.
   - Add a secure server adapter for a hosted PaddleOCR + IBM Docling service; merge their table/layout detections with Tesseract/native text rather than choosing only one engine.
   - Clearly report unsupported/unavailable engines instead of silently falling back to a page image.

3. **Rebuild PowerPoint export as editable elements**
   - Emit text boxes with script-safe fonts, exact coordinates, alignment, and fitting.
   - Emit detected tables as PowerPoint tables and detected rules/boxes as editable shapes.
   - Preserve logos and photographs as cropped image elements only; do not use a full-page image in OCR mode.

4. **Rebuild Word export as valid flowing/fixed-layout DOCX**
   - Remove the fragile header-background and absolute-frame approach.
   - Emit valid DOCX tables, paragraphs, borders, shading, images, and page sections.
   - Preserve Devanagari with Unicode text and Nirmala UI/Mangal-compatible font hints.
   - Limit editable OCR output to DOCX; keep legacy DOC only for image conversion because it cannot reliably preserve this structure.

5. **Improve conversion controls and feedback**
   - Rename modes so “Editable OCR” and “Exact image” are unambiguous.
   - Show OCR engine progress, detected language, low-confidence warnings, and whether PaddleOCR/Docling are connected.

6. **Validate with the supplied example**
   - Compare the source PDF screenshots with converted slide/document geometry.
   - Verify the generated PPTX/DOCX packages, inspect rendered pages, and fix overlaps, clipping, invalid formatting, and Devanagari shaping regressions.

## Technical requirement
PaddleOCR and IBM Docling are native Python services and cannot execute in the app’s browser/server runtime. They must be deployed behind one authenticated HTTPS endpoint. Tesseract can run locally in the browser. The app will support the hosted endpoint without exposing its secret to the browser.
