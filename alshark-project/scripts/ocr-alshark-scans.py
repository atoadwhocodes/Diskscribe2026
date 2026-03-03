"""
OCR Alshark scanned PDF using Gemini 2.5 Pro vision.
Renders each page to an image, sends to Gemini for Japanese text extraction.
Saves results to ALSHARK-SCANS-OCR/ folder.

Free tier: 5 RPM → ~13s delay between requests.
73 pages ≈ 16 minutes.
"""

import fitz  # pymupdf
import json
import os
import sys
import time
import base64
from pathlib import Path
from google import genai
from google.genai import types

# Fix Windows console encoding for Japanese output
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# ── Configuration ──────────────────────────────────────────────────
API_KEY = os.environ.get("GEMINI_API_KEY", "***REMOVED***")
MODEL_NAME = "gemini-2.5-pro"
PROJECT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PDF_PATH = os.path.join(PROJECT_ROOT, "reference", "Alshark (scans).pdf")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "ALSHARK-SCANS-OCR")
CHECKPOINT = os.path.join(OUTPUT_DIR, "ocr-checkpoint.json")
DELAY_S = 13.0
MAX_RETRIES = 5
DPI = 200  # render quality (200 DPI is good balance of quality vs size)

# ── Setup ──────────────────────────────────────────────────────────
os.makedirs(OUTPUT_DIR, exist_ok=True)
client = genai.Client(api_key=API_KEY)

PROMPT = """You are an expert OCR system for Japanese documents. 
Extract ALL text from this scanned page of the Alshark PC-9801 game manual/guide.

Rules:
- Output the text exactly as it appears, preserving layout where possible
- Include ALL Japanese text (kanji, hiragana, katakana)
- Include any English/romaji text
- For tables, use | separators
- For character profiles, preserve name/stat formatting
- If the page is mostly artwork with minimal text, describe what's shown briefly and note any text labels
- If the page appears blank or is just a cover/divider, say [COVER PAGE] or [DIVIDER] etc.
- Output in the original Japanese - do NOT translate"""


def load_checkpoint():
    if os.path.exists(CHECKPOINT):
        with open(CHECKPOINT, encoding='utf-8') as f:
            return json.load(f)
    return {"completed_pages": [], "results": {}}


def save_checkpoint(data):
    with open(CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def ocr_page(page_img_bytes: bytes, page_num: int) -> str:
    """Send a page image to Gemini for OCR."""
    b64 = base64.b64encode(page_img_bytes).decode('utf-8')
    
    for attempt in range(MAX_RETRIES):
        try:
            response = client.models.generate_content(
                model=MODEL_NAME,
                contents=[
                    types.Part.from_bytes(data=page_img_bytes, mime_type="image/png"),
                    PROMPT
                ],
                config=types.GenerateContentConfig(
                    temperature=0.1,
                    max_output_tokens=8192,
                )
            )
            
            text = response.text
            if text:
                return text.strip()
            else:
                print(f"  [!] Page {page_num}: Empty response, retry {attempt+1}")
                time.sleep(DELAY_S * 2)
                
        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                wait = DELAY_S * (attempt + 2)
                print(f"  [!] Rate limited, waiting {wait:.0f}s...")
                time.sleep(wait)
            elif "503" in err or "UNAVAILABLE" in err:
                wait = DELAY_S * (attempt + 2)
                print(f"  [!] Service unavailable, waiting {wait:.0f}s...")
                time.sleep(wait)
            else:
                print(f"  [!] Error on page {page_num}: {err}")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(DELAY_S)
                else:
                    return f"[OCR ERROR: {err}]"
    
    return "[OCR FAILED after retries]"


def main():
    print(f"Opening {PDF_PATH}...")
    doc = fitz.open(PDF_PATH)
    total = len(doc)
    print(f"Total pages: {total}")
    
    checkpoint = load_checkpoint()
    completed = set(checkpoint["completed_pages"])
    results = checkpoint["results"]
    
    remaining = [i for i in range(total) if i not in completed]
    print(f"Already done: {len(completed)}, Remaining: {len(remaining)}")
    
    if not remaining:
        print("All pages already OCR'd!")
    else:
        est_minutes = len(remaining) * DELAY_S / 60
        print(f"Estimated time: {est_minutes:.1f} minutes")
    
    for idx, page_idx in enumerate(remaining):
        page = doc[page_idx]
        page_num = page_idx + 1
        
        # Render page to PNG
        mat = fitz.Matrix(DPI / 72, DPI / 72)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")
        img_kb = len(img_bytes) / 1024
        
        print(f"\n[{len(completed)+1}/{total}] Page {page_num} ({img_kb:.0f} KB)...", end=" ", flush=True)
        
        text = ocr_page(img_bytes, page_num)
        
        # Preview first line (ASCII-safe for Windows console)
        preview = text.split('\n')[0][:60] if text else "(empty)"
        try:
            print(f"OK: {preview}")
        except UnicodeEncodeError:
            safe = preview.encode('ascii', errors='replace').decode('ascii')
            print(f"OK: {safe}")
        
        results[str(page_num)] = text
        completed.add(page_idx)
        checkpoint["completed_pages"] = list(completed)
        checkpoint["results"] = results
        save_checkpoint(checkpoint)
        
        # Save individual page text
        page_file = os.path.join(OUTPUT_DIR, f"page-{page_num:02d}.txt")
        with open(page_file, 'w', encoding='utf-8') as f:
            f.write(text)
        
        # Rate limit delay (skip on last page)
        if idx < len(remaining) - 1:
            time.sleep(DELAY_S)
    
    doc.close()
    
    # Combine all pages into one file
    combined = os.path.join(OUTPUT_DIR, "alshark-scans-full-ocr.txt")
    with open(combined, 'w', encoding='utf-8') as f:
        for i in range(1, total + 1):
            key = str(i)
            if key in results:
                f.write(f"\n{'='*60}\n")
                f.write(f"PAGE {i}\n")
                f.write(f"{'='*60}\n\n")
                f.write(results[key])
                f.write('\n')
    
    print(f"\n✓ OCR complete! {total} pages saved to {OUTPUT_DIR}/")
    print(f"  Combined: {combined}")
    print(f"  Individual: {OUTPUT_DIR}/page-NN.txt")


if __name__ == "__main__":
    main()
