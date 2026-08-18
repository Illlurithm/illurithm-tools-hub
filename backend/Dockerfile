# Hugging Face Spaces (Docker) / Render / Fly compatible image.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    HF_HOME=/tmp/hf \
    EASYOCR_MODULE_PATH=/tmp/easyocr

RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-mar tesseract-ocr-spa \
    libgl1 libglib2.0-0 fonts-noto-core fonts-noto-devanagari \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .

# Hugging Face Spaces expects port 7860.
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--timeout-keep-alive", "300"]
