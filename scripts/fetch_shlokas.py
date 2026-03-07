#!/usr/bin/env python3
"""
Fetch all 700 Bhagavad Gita shlokas from the free vedicscriptures API
and format them for VaakSiddhi.
"""

import json
import time
import urllib.request
import urllib.error
import sys
import os

# Verse counts per chapter (18 chapters, 700 total verses)
CHAPTER_VERSES = {
    1: 47, 2: 72, 3: 43, 4: 42, 5: 29, 6: 47,
    7: 30, 8: 28, 9: 34, 10: 42, 11: 55, 12: 20,
    13: 35, 14: 27, 15: 20, 16: 24, 17: 28, 18: 78
}

CHAPTER_NAMES = {
    1: "Arjuna Vishada Yoga",
    2: "Sankhya Yoga",
    3: "Karma Yoga",
    4: "Jnana Karma Sanyasa Yoga",
    5: "Karma Sanyasa Yoga",
    6: "Dhyana Yoga",
    7: "Jnana Vijnana Yoga",
    8: "Aksara Brahma Yoga",
    9: "Raja Vidya Raja Guhya Yoga",
    10: "Vibhuti Yoga",
    11: "Vishwarupa Darshana Yoga",
    12: "Bhakti Yoga",
    13: "Kshetra Kshetrajna Vibhaga Yoga",
    14: "Gunatraya Vibhaga Yoga",
    15: "Purushottama Yoga",
    16: "Daivasura Sampad Vibhaga Yoga",
    17: "Shraddhatraya Vibhaga Yoga",
    18: "Moksha Sanyasa Yoga"
}

# Famous/important verses get lower difficulty
FAMOUS_VERSES = {
    (2, 47), (2, 22), (2, 20), (2, 14), (2, 27),  # Very famous Chapter 2
    (4, 7), (4, 8), (4, 34),                        # Yada yada hi dharmasya
    (9, 22), (9, 26), (9, 27),                       # Popular devotional
    (11, 32), (11, 33),                              # Oppenheimer verse etc.
    (12, 13), (12, 14),                              # Qualities of devotee
    (15, 15),                                         # Sarvasya chaham
    (18, 66), (18, 65), (18, 78),                    # Surrender verses
    (2, 62), (2, 63),                                # Chain of destruction
    (3, 21), (6, 5), (6, 6),                         # Self effort
}

BASE_URL = "https://vedicscriptures.github.io/slok"

def estimate_difficulty(chapter, verse, sanskrit_text):
    """Estimate pronunciation difficulty based on verse characteristics."""
    if (chapter, verse) in FAMOUS_VERSES:
        return "beginner"
    
    # Longer verses are harder
    line_count = sanskrit_text.count('\n') + 1
    char_count = len(sanskrit_text)
    
    # Check for complex conjunct consonants
    complex_sounds = ['क्ष', 'त्र', 'ज्ञ', 'श्र', 'ष्ट', 'ष्ण', 'द्ध', 'त्त', 'क्त', 'ङ्क', 'ञ्च', 'ण्ड', 'न्ध', 'म्ब']
    complexity = sum(1 for s in complex_sounds if s in sanskrit_text)
    
    if char_count < 80 and complexity < 3:
        return "beginner"
    elif char_count < 140 and complexity < 5:
        return "intermediate"
    else:
        return "advanced"

def extract_hard_sounds(sanskrit_text):
    """Extract potentially difficult sounds from Sanskrit text."""
    hard_sound_map = {
        'क्ष': 'ksha', 'त्र': 'tra', 'ज्ञ': 'gya/jña',
        'श्र': 'shra', 'ष्ट': 'shta', 'ष्ण': 'shna',
        'ध': 'dha', 'ध्': 'dh', 'भ': 'bha',
        'ठ': 'tha', 'ढ': 'dha', 'ण': 'na (retroflex)',
        'ऋ': 'ri', 'ॠ': 'rri', 'ञ': 'nya',
        'ङ': 'nga', 'छ': 'chha', 'झ': 'jha',
        'ट': 'ta (retroflex)', 'ड': 'da (retroflex)',
    }
    
    found = []
    for char, romanized in hard_sound_map.items():
        if char in sanskrit_text and romanized not in found:
            found.append(romanized)
    
    return found[:5]  # Limit to 5 hard sounds per verse

def fetch_verse(chapter, verse, retries=3):
    """Fetch a single verse from the API with retry logic."""
    url = f"{BASE_URL}/{chapter}/{verse}"
    
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': 'VaakSiddhi/1.0 (Sanskrit Learning App)'
            })
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode('utf-8'))
                return data
        except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
            if attempt < retries - 1:
                time.sleep(1 * (attempt + 1))
            else:
                print(f"  FAILED: Chapter {chapter}, Verse {verse}: {e}", file=sys.stderr)
                return None

def format_verse(data, chapter, verse):
    """Format API data into VaakSiddhi shloka format."""
    if not data:
        return None
    
    sanskrit = data.get('slok', '')
    transliteration = data.get('transliteration', '')
    
    # Get Hindi meaning (prefer Tejomayananda, fallback to others)
    hindi = ''
    if data.get('tej', {}).get('ht'):
        hindi = data['tej']['ht']
    elif data.get('rams', {}).get('ht'):
        hindi = data['rams']['ht']
    elif data.get('rpierce', {}).get('ht'):
        hindi = data.get('rpierce', {}).get('ht', '')
    
    # Get English meaning (prefer Sivananda, fallback to others)
    english = ''
    if data.get('siva', {}).get('et'):
        english = data['siva']['et']
    elif data.get('purohit', {}).get('et'):
        english = data['purohit']['et']
    elif data.get('gambir', {}).get('et'):
        english = data['gambir']['et']
    
    difficulty = estimate_difficulty(chapter, verse, sanskrit)
    hard_sounds = extract_hard_sounds(sanskrit)
    
    # Extract keywords from transliteration (first few significant words)
    keywords = []
    if transliteration:
        words = [w.strip('.,|!? ') for w in transliteration.split() if len(w) > 3]
        keywords = list(dict.fromkeys(words))[:5]  # Unique, max 5
    
    return {
        "id": f"BG{chapter}.{verse}",
        "chapter": chapter,
        "verse": verse,
        "chapter_name": CHAPTER_NAMES[chapter],
        "title": f"Chapter {chapter}, Verse {verse}",
        "sanskrit": sanskrit.strip(),
        "transliteration": transliteration.strip(),
        "hindi": hindi.strip(),
        "english": english.strip(),
        "difficulty": difficulty,
        "keywords": keywords,
        "hard_sounds": hard_sounds
    }

def main():
    output_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 
                                'src', 'data', 'shlokas.json')
    progress_path = output_path + '.progress'
    
    # Resume from progress if available
    all_shlokas = []
    existing_ids = set()
    if os.path.exists(progress_path):
        with open(progress_path, 'r', encoding='utf-8') as f:
            all_shlokas = json.load(f)
            existing_ids = {s['id'] for s in all_shlokas}
        print(f"Resuming from {len(all_shlokas)} previously fetched shlokas")
    
    total = sum(CHAPTER_VERSES.values())
    fetched = len(all_shlokas)
    failed = 0
    
    print(f"Fetching all {total} Bhagavad Gita shlokas...")
    print(f"Output: {output_path}")
    print("-" * 50)
    
    for chapter in range(1, 19):
        verse_count = CHAPTER_VERSES[chapter]
        chapter_existing = len([s for s in all_shlokas if s['chapter'] == chapter])
        
        if chapter_existing == verse_count:
            print(f"\nChapter {chapter}: {CHAPTER_NAMES[chapter]} — already complete ({verse_count} verses)")
            continue
            
        print(f"\nChapter {chapter}: {CHAPTER_NAMES[chapter]} ({verse_count} verses, {chapter_existing} already fetched)")
        
        for verse in range(1, verse_count + 1):
            verse_id = f"BG{chapter}.{verse}"
            if verse_id in existing_ids:
                continue
                
            fetched += 1
            sys.stdout.write(f"\r  Fetching verse {verse}/{verse_count} (Total: {fetched}/{total})")
            sys.stdout.flush()
            
            data = fetch_verse(chapter, verse)
            if data:
                formatted = format_verse(data, chapter, verse)
                if formatted:
                    all_shlokas.append(formatted)
                    existing_ids.add(verse_id)
                else:
                    failed += 1
            else:
                failed += 1
            
            # Rate limiting: be nice to the free API
            time.sleep(0.1)
        
        # Save progress after each chapter
        all_shlokas.sort(key=lambda s: (s['chapter'], s['verse']))
        with open(progress_path, 'w', encoding='utf-8') as f:
            json.dump(all_shlokas, f, ensure_ascii=False, indent=2)
        
        print(f"\n  ✓ Chapter {chapter} complete ({len([s for s in all_shlokas if s['chapter'] == chapter])} verses) [saved]")
    
    print(f"\n{'=' * 50}")
    print(f"Total fetched: {len(all_shlokas)}")
    print(f"Failed: {failed}")
    
    # Sort by chapter and verse, write final file
    all_shlokas.sort(key=lambda s: (s['chapter'], s['verse']))
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_shlokas, f, ensure_ascii=False, indent=2)
    
    # Clean up progress file
    if os.path.exists(progress_path):
        os.remove(progress_path)
    
    print(f"Written to: {output_path}")
    
    # Stats
    difficulty_counts = {}
    for s in all_shlokas:
        d = s['difficulty']
        difficulty_counts[d] = difficulty_counts.get(d, 0) + 1
    
    print(f"\nDifficulty distribution:")
    for d, count in sorted(difficulty_counts.items()):
        print(f"  {d}: {count}")

if __name__ == '__main__':
    main()
