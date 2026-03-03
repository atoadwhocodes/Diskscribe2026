"""
ALSHARK Translator - Google Gemini 2.0 Pro (Python)
High-quality Japanese→English translation using google-genai SDK.
With checkpointing, half-width katakana normalization, batch mode, and retry logic.

Usage:
  python translate-gemini-pro.py
"""

import json
import os
import re
import sys
import time
from pathlib import Path
from google import genai
from google.genai import types

# ── Configuration ──────────────────────────────────────────────────
API_KEY = os.environ.get("GEMINI_API_KEY", "***REMOVED***")
MODEL_NAME = "gemini-2.5-pro"

# Resolve paths relative to project root (alshark-project/)
PROJECT_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
INPUT = os.path.join(PROJECT_ROOT, "data", "ALSHARK-EXTRACTED-REV", "alshark-translation-ready.json")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "data", "ALSHARK-TRANSLATED-REV")
CHECKPOINT = os.path.join(OUTPUT_DIR, "gemini-pro-checkpoint.json")
OUTPUT = os.path.join(OUTPUT_DIR, "translations.json")

# Gemini 2.5 Pro free tier: 5 RPM / 250K tokens/day
# Be conservative: 1 request per 13 seconds
DELAY_S = 13.0
CHECKPOINT_EVERY = 10
MAX_RETRIES = 5
BATCH_SIZE = 10


# ── Half-width katakana → Hiragana ─────────────────────────────────
HW_TO_HIRAGANA = {
    'ｦ': 'を', 'ｧ': 'ぁ', 'ｨ': 'ぃ', 'ｩ': 'ぅ', 'ｪ': 'ぇ', 'ｫ': 'ぉ',
    'ｬ': 'ゃ', 'ｭ': 'ゅ', 'ｮ': 'ょ', 'ｯ': 'っ', 'ｰ': 'ー',
    'ｱ': 'あ', 'ｲ': 'い', 'ｳ': 'う', 'ｴ': 'え', 'ｵ': 'お',
    'ｶ': 'か', 'ｷ': 'き', 'ｸ': 'く', 'ｹ': 'け', 'ｺ': 'こ',
    'ｻ': 'さ', 'ｼ': 'し', 'ｽ': 'す', 'ｾ': 'せ', 'ｿ': 'そ',
    'ﾀ': 'た', 'ﾁ': 'ち', 'ﾂ': 'つ', 'ﾃ': 'て', 'ﾄ': 'と',
    'ﾅ': 'な', 'ﾆ': 'に', 'ﾇ': 'ぬ', 'ﾈ': 'ね', 'ﾉ': 'の',
    'ﾊ': 'は', 'ﾋ': 'ひ', 'ﾌ': 'ふ', 'ﾍ': 'へ', 'ﾎ': 'ほ',
    'ﾏ': 'ま', 'ﾐ': 'み', 'ﾑ': 'む', 'ﾒ': 'め', 'ﾓ': 'も',
    'ﾔ': 'や', 'ﾕ': 'ゆ', 'ﾖ': 'よ',
    'ﾗ': 'ら', 'ﾘ': 'り', 'ﾙ': 'る', 'ﾚ': 'れ', 'ﾛ': 'ろ',
    'ﾜ': 'わ', 'ﾝ': 'ん', 'ﾞ': '゛', 'ﾟ': '゜',
    '｡': '。', '｢': '「', '｣': '」', '､': '、', '･': '・'
}
DAKUTEN = {
    'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
    'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど',
    'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    'う': 'ゔ'
}
HANDAKUTEN = {
    'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ'
}


def half_katakana_to_hiragana(s: str) -> str:
    """Convert half-width katakana (used on PC-98 as hiragana substitute) to proper hiragana."""
    result = []
    i = 0
    while i < len(s):
        ch = s[i]
        nxt = s[i + 1] if i + 1 < len(s) else None
        if ch in HW_TO_HIRAGANA:
            fw = HW_TO_HIRAGANA[ch]
            if nxt == 'ﾞ' and fw in DAKUTEN:
                fw = DAKUTEN[fw]
                i += 1
            elif nxt == 'ﾟ' and fw in HANDAKUTEN:
                fw = HANDAKUTEN[fw]
                i += 1
            result.append(fw)
        else:
            result.append(ch)
        i += 1
    return ''.join(result)


def clean_for_translation(text: str) -> str:
    """Remove game script control codes and normalize katakana for translation."""
    cleaned = text
    cleaned = re.sub(r'#[A-Z][0-9A-Z]*', '', cleaned)
    cleaned = re.sub(r'![0-9A-Z@_#]', '', cleaned)
    cleaned = cleaned.replace('_「', '「')
    cleaned = re.sub(r'_([0-9])', ' ', cleaned)
    cleaned = cleaned.replace('@', ' ')
    cleaned = cleaned.replace('\\', ' ')
    cleaned = re.sub(r'\$.', '', cleaned)
    cleaned = re.sub(r'%.', '', cleaned)
    cleaned = re.sub(r'\s+', ' ', cleaned)
    cleaned = cleaned.strip()
    cleaned = half_katakana_to_hiragana(cleaned)
    return cleaned


ALSHARK_GLOSSARY = """
=== CHARACTER NAME GLOSSARY (use these exact spellings) ===
PARTY: Sion Asmarn (protagonist, 18M Martian), Shoko Penrose (18F Martian, Sion's girlfriend, genius psychic),
  Kal (robot K-П 01845, mascot/tutor), Scrap Joe / Joe Compson (48M mechanic, builds weapons),
  Werda Mullets (25F Martian-Zolius hybrid, mutant warrior 225cm), Lucia Asmarn (39F, Sion's mother),
  Duke Giedel (masked knight of Ulyria, Raysword master, red hair)
VILLAINS: Jagma Dorian (Zolius Supreme Commander), Lalawel Dorian (Jagma's sister, "Ice Lalawel", fortress Barbas),
  Novel Sullivan (Zolius Space Force Commander, "Sky-Victory Flag Sullivan", battleship Russelgaia),
  Gadmos Bayden (Zolius Star Force Commander, "Beast Bayden", 627cm biosoldier, Black Beast unit)
OTHER: Zid (Sion's father), Dr. Penrose (Shoko's father), Fara Mullets (Werda's mother),
  Eele-Kose (King of Ulyria), We-Dumnah (ancient founder of Mars colony)

=== WORLD / PROPER NOUNS ===
Universe: Whisperard (12 planets, 3 star systems). Races: Martians (Mars People), Zolius (horned, psychic).
Nations: Mars Federation, Zolius Empire (military state), Ulyria Kingdom.
Places: Hom (starting colonial planet), Mars, Bieza (Jagma's Mound Castle), Yosnu, Dust (Joe's junkyard).
Religion: Santhana Church (Zolius state religion, founded by Lalawel).
Ships: Atlia (party's fighting carrier, 90.5m, built by Joe), Russelgaia (Sullivan's battleship), Barbas (Zolius fortress).
Weapons: Raysword (energy sword), frozen-ray (cryogenic weapon).

=== GAME TERMS ===
CREDIT (currency), SCRAP (junk material for crafting), HP, PP (Physical Points—die at 0),
MP (Mental Points), SP (Shield Points for vehicles), Biosoldier, Black Beast (elite unit).
"""


def translate_batch(client, items: list[str]) -> list[str]:
    """Translate a batch of strings in one API call using numbered list format."""
    numbered = '\n'.join(f'[{i+1}] {text}' for i, text in enumerate(items))

    prompt = f"""You are a professional Japanese-to-English translator specializing in 1990s Japanese RPG video games.

Translate each numbered line below from Japanese to English. This dialogue is from the 1991 PC-98 sci-fi RPG "Alshark" by Light Staff — a space opera set in the Whisperard universe.

{ALSHARK_GLOSSARY}

Rules:
- Output ONLY the translations, one per line, keeping the [N] numbering
- Keep translations concise — they must fit in a small dialog box (~40 English characters wide)
- Use the EXACT character/place name spellings from the glossary above
- Preserve tone and personality (casual speech, formal speech, military speech, etc.)
- Keep proper nouns as-is (character names, place names)
- Do not add quotes, notes, or explanations

{numbered}"""

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=16384,
        )
    )

    text = response.text
    translations = [''] * len(items)

    for line in text.split('\n'):
        match = re.match(r'^\[(\d+)\]\s*(.+)', line)
        if match:
            idx = int(match.group(1)) - 1
            if 0 <= idx < len(items):
                translations[idx] = match.group(2).strip()

    return translations


def translate_single(client, text: str) -> str:
    """Translate a single string (fallback for failed batch items)."""
    prompt = f"""Translate this Japanese RPG dialogue to concise English. Output ONLY the translation.
From the 1991 PC-98 RPG "Alshark" by Light Staff (sci-fi space opera set in Whisperard).

{ALSHARK_GLOSSARY}

Japanese: {text}
English:"""

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.1,
            max_output_tokens=4096,
        )
    )

    translation = response.text.strip()
    # Clean up common LLM artifacts
    translation = re.sub(r'^English:\s*', '', translation, flags=re.IGNORECASE)
    translation = re.sub(r'^["\'](.*)["\']\s*$', r'\1', translation, flags=re.DOTALL)
    translation = re.sub(r'^Translation:\s*', '', translation, flags=re.IGNORECASE)
    translation = re.sub(r'\s*\(Note:.*?\)\s*$', '', translation, flags=re.IGNORECASE)
    translation = re.sub(r'^Here is the (?:English )?translation[:\s]*', '', translation, flags=re.IGNORECASE)
    # Take first line only
    translation = translation.split('\n')[0].strip()
    return translation


def main():
    print("=== ALSHARK Gemini Pro Translator (Python) ===")
    print(f"Model: {MODEL_NAME} | Batch size: {BATCH_SIZE}\n")

    if API_KEY == "YOUR_API_KEY_HERE" or not API_KEY:
        print("ERROR: Set your Gemini API key!")
        print("  Option 1: set GEMINI_API_KEY=your_key_here")
        print("  Option 2: Edit API_KEY in this file")
        print("\nGet a free key at: https://aistudio.google.com/apikey")
        sys.exit(1)

    # Initialize client
    client = genai.Client(api_key=API_KEY)

    # Create output directory
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Load source data
    if not os.path.exists(INPUT):
        print(f"Input file not found: {INPUT}")
        sys.exit(1)

    with open(INPUT, 'r', encoding='utf-8') as f:
        data = json.load(f)
    strings = data['strings']
    print(f"Total strings: {len(strings)}")

    # Load checkpoint if exists
    results = []
    start_idx = 0

    if os.path.exists(CHECKPOINT):
        try:
            with open(CHECKPOINT, 'r', encoding='utf-8') as f:
                cp = json.load(f)
            results = cp.get('translations', [])
            start_idx = cp.get('index', 0)
            print(f"Resuming from string {start_idx} ({len(results)} already done)")
        except Exception:
            print("Checkpoint invalid, starting fresh")

    # Quick connectivity test
    print("Testing Gemini API...")
    try:
        test = client.models.generate_content(
            model=MODEL_NAME,
            contents='Say "ready"',
            config=types.GenerateContentConfig(max_output_tokens=4096)
        )
        print(f"API connected: {test.text.strip()[:30]}")
    except Exception as e:
        print(f"Failed to connect to Gemini API: {e}")
        sys.exit(1)

    start_time = time.time()
    errors = 0
    i = start_idx

    # Process in batches
    while i < len(strings):
        batch_end = min(i + BATCH_SIZE, len(strings))
        batch_strings = []
        batch_meta = []

        for j in range(i, batch_end):
            s = strings[j]
            cleaned = clean_for_translation(s['sourceText'])
            batch_strings.append(cleaned)
            batch_meta.append(s)

        # Check for empty/tiny strings that don't need translation
        needs_translation = [bool(s and len(s) >= 2) for s in batch_strings]
        to_translate = [s for s, need in zip(batch_strings, needs_translation) if need]

        translations = []

        if to_translate:
            for attempt in range(MAX_RETRIES):
                try:
                    if len(to_translate) == 1:
                        t = translate_single(client, to_translate[0])
                        translations = [t]
                    else:
                        translations = translate_batch(client, to_translate)
                    break
                except Exception as err:
                    err_msg = str(err)
                    print(f"\n  Batch [{i}-{batch_end}] attempt {attempt+1} failed: {err_msg}")

                    if '429' in err_msg or 'quota' in err_msg or 'RATE' in err_msg.upper():
                        print("  Rate limited — waiting 60s...")
                        time.sleep(60)
                    elif 'API_KEY' in err_msg or 'permission' in err_msg:
                        print("\n  FATAL: API key issue. Exiting.")
                        sys.exit(1)
                    else:
                        time.sleep(10)

                    if attempt == MAX_RETRIES - 1:
                        print("  Falling back to individual translation...")
                        translations = []
                        for text in to_translate:
                            try:
                                t = translate_single(client, text)
                                translations.append(t)
                                time.sleep(DELAY_S)
                            except Exception:
                                translations.append("[ERROR]")
                                errors += 1

        # Map translations back to results
        t_idx = 0
        for j, s in enumerate(batch_meta):
            if not needs_translation[j]:
                translation = batch_strings[j] or ' '
            else:
                translation = (translations[t_idx] if t_idx < len(translations) else '').strip()
                if not translation:
                    translation = '[EMPTY]'
                    errors += 1
                t_idx += 1

            results.append({
                'id': s['id'],
                'disk': s['disk'],
                'offset': s['offset'],
                'maxBytes': s['maxBytes'],
                'source': s['sourceText'],
                'translation': translation
            })

        i = batch_end

        # Progress
        done = len(results)
        elapsed = time.time() - start_time
        rate = (done - start_idx) / elapsed if elapsed > 0 else 0
        remaining = len(strings) - done
        eta = remaining / rate / 60 if rate > 0 else 0
        sys.stdout.write(
            f"\r[{done}/{len(strings)}] {rate:.2f}/s ETA: {eta:.1f}m errs: {errors}    "
        )
        sys.stdout.flush()

        # Checkpoint
        if done % CHECKPOINT_EVERY == 0 or i >= len(strings):
            with open(CHECKPOINT, 'w', encoding='utf-8') as f:
                json.dump({'index': i, 'translations': results}, f)

        # Rate limit between batches
        if i < len(strings):
            time.sleep(DELAY_S)

    # Final save
    print("\n\nSaving results...")

    with open(CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump({'index': len(strings), 'translations': results}, f)

    output_data = {
        'game': 'Alshark',
        'platform': 'PC-98',
        'model': f'gemini-{MODEL_NAME}',
        'translated': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'count': len(results),
        'errors': errors,
        'translations': results
    }

    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(output_data, f, indent=2, ensure_ascii=False)

    total_time = (time.time() - start_time) / 60
    print(f"\nComplete!")
    print(f"Translated: {len(results)} strings")
    print(f"Errors: {errors}")
    print(f"Time: {total_time:.1f} minutes")
    print(f"Output: {OUTPUT}")


if __name__ == '__main__':
    main()
