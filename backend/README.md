# PDF → Word microservice

FastAPI + Docling + python-docx service that returns a `.docx` with full-width native
tables and Unicode-safe Arial / Noto Sans Devanagari fonts.

## Run locally

```bash
cd backend
pip install -r requirements.txt
uvicorn app:app --port 7860
```

## Deploy (Hugging Face Spaces, Docker SDK)

1. Create a new Space → SDK: **Docker** → Blank.
2. Upload `Dockerfile`, `requirements.txt`, `app.py` (keep `app_port: 7860` in the Space README metadata).
3. Wait for the build, then your endpoint is `https://<user>-<space>.hf.space/convert`.

Render / Fly / Modal work the same way with this Dockerfile (set the port to `7860`
or change the `CMD`).

## API

`POST /convert` — `multipart/form-data`

| field | type | notes |
| --- | --- | --- |
| `file` | file | the source PDF (required) |
| `ocr_enabled` | bool | run OCR for scanned pages |
| `preserve_layout` | bool | reconstruct table grids |
| `language_pack` | string | `en`, `en_hi_mr`, `en_es` |
| `ocr_language` | string | optional single-language hint |

Returns the binary `.docx` (`Content-Disposition` carries the filename).
`422` = unreadable / low-resolution scan, `415` = not a PDF.

## Connect the web app

In the PDF to WORD tool click **Backend**, paste the `/convert` URL and save
(stored per browser). Alternatively set `VITE_PDF_CONVERT_URL` in `.env` as the default.
