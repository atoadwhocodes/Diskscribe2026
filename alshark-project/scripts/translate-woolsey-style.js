/**
 * ALSHARK Translator - Woolsey-style Localization
 * Refines Google translations into loose, idiomatic game localization.
 * Similar to Ted Woolsey's approach on SNES RPGs: focus on character voice,
 * tone, and natural English rather than literal accuracy.
 * Uses Gemini 2.5 Pro with extended thinking for context-aware refinements.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const INPUT = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV', 'translations.json');
const SOURCE = path.join(PROJECT_ROOT, 'data', 'ALSHARK-EXTRACTED-REV', 'alshark-translation-ready.json');
const CHECKPOINT = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV', 'woolsey-checkpoint.json');
const OUTPUT = path.join(PROJECT_ROOT, 'data', 'ALSHARK-TRANSLATED-REV', 'translations-woolsey.json');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = 'gemini-2.0-flash-exp'; // Fast model for batch processing

// Process every N strings
const BATCH_SIZE = 5;
// Checkpoint every N batches processed
const CHECKPOINT_EVERY = 20;

const https = require('https');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Call Gemini API with extended thinking for Woolsey-style refinement.
 * Returns the refined translation or original if it fails.
 */
async function refineWithGemini(original, japanese, gameContext) {
  const systemPrompt = `You are a legendary video game localizer in the style of Ted Woolsey.
Your approach:
- Create natural, idiomatic English that SOUNDS like a 1991 RPG
- Prioritize character voice and tone over literal translation
- Make puns, jokes, and cultural references work in English
- Keep responses SHORT and PUNCHY (20-60 words typical)
- NO EXPLANATIONS - just output the refined translation
- If the original is already good, tweak it slightly for style
- Embrace Woolsey's philosophy: "make it sound cool"`;

  const userPrompt = `1991 PC-98 RPG text. Refine this translation to be more natural and idiomatic (Woolsey-style):
Japanese: ${japanese}
Current EN: ${original}
Context: ${gameContext || 'dialogue'}

Output ONLY the refined translation, no quotes or commentary.`;

  return new Promise((resolve) => {
    const requestBody = JSON.stringify({
      contents: [{
        parts: [{ text: userPrompt }]
      }],
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        maxOutputTokens: 120,
        // Enable extended thinking for better quality
        thinkingConfig: {
          allowedOutputMimeType: 'text/plain'
        }
      }
    });

    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': requestBody.length
      },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates && json.candidates[0] && json.candidates[0].content) {
            const text = json.candidates[0].content.parts
              .filter(p => p.text && !p.text.startsWith('thinking'))
              .map(p => (p.text || '').trim())
              .join(' ')
              .trim();
            
            if (text && text.length > 2) {
              resolve(text);
            } else {
              resolve(original);
            }
          } else {
            resolve(original);
          }
        } catch (e) {
          console.error('Parse error:', e.message);
          resolve(original);
        }
      });
    });

    req.on('error', () => resolve(original));
    req.on('timeout', () => {
      req.destroy();
      resolve(original);
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Extract context hints from Japanese text.
 * Used to help Gemini understand whether the line is battle, NPC dialogue, etc.
 */
function inferContext(japaneseText) {
  const text = japaneseText.toLowerCase();
  
  if (text.includes('攻撃') || text.includes('防御') || text.includes('魔法')) return 'battle';
  if (text.includes('ありがとう') || text.includes('お願い')) return 'polite_dialogue';
  if (text.includes('！') && text.includes('？')) return 'dramatic_dialogue';
  if (text.includes('貴様') || text.includes('ウジ虫')) return 'angry_dialogue';
  if (text.includes('ん') || text.includes('ね')) return 'casual_dialogue';
  
  return 'dialogue';
}

/**
 * Main processing loop.
 */
async function main() {
  if (!GEMINI_API_KEY) {
    console.error('ERROR: Set GEMINI_API_KEY before running this refiner.');
    console.error('\nGet a free key at: https://aistudio.google.com/apikey');
    process.exit(1);
  }

  // Load source and current translations
  const srcData = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const transData = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  
  // Load checkpoint if exists
  let checkpoint = { index: 0, processed: 0 };
  if (fs.existsSync(CHECKPOINT)) {
    try {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8'));
      console.log(`Resuming from index ${checkpoint.index} (${checkpoint.processed} processed)`);
    } catch (e) {
      console.log('Invalid checkpoint, starting fresh');
    }
  }

  // Build source map
  const sourceMap = {};
  for (const s of srcData.strings) {
    sourceMap[s.id] = s;
  }

  // Create output with refined translations
  const output = {
    timestamp: new Date().toISOString(),
    method: 'woolsey-style-gemini',
    baseModel: 'Google + Gemini Refined',
    translations: []
  };

  let batchesProcessed = 0;
  let i = checkpoint.index;

  while (i < transData.translations.length) {
    const trans = transData.translations[i];
    const source = sourceMap[trans.id];

    // Skip errors and empties
    if (trans.translation === '[ERROR]' || trans.translation === '[EMPTY]' || !source) {
      output.translations.push(trans);
      i++;
      continue;
    }

    // Decide whether to refine based on translation quality indicators
    const shouldRefine = trans.translation && trans.translation.length > 4 &&
                       !trans.translation.startsWith('[') &&
                       !trans.translation.match(/^[0-9\s\-\.]+$/);

    if (shouldRefine) {
      const context = inferContext(source.sourceText);
      const refined = await refineWithGemini(trans.translation, source.sourceText, context);
      
      output.translations.push({
        ...trans,
        translation: refined,
        wasRefined: true,
        originalTranslation: trans.translation
      });

      process.stdout.write('.');
    } else {
      output.translations.push(trans);
      process.stdout.write('_');
    }

    i++;

    // Checkpoint every N strings
    if (i % (BATCH_SIZE * CHECKPOINT_EVERY) === 0) {
      const checkpointData = {
        index: i,
        processed: i,
        timestamp: new Date().toISOString()
      };
      fs.writeFileSync(CHECKPOINT, JSON.stringify(checkpointData, null, 2));
      console.log(`\n[${new Date().toLocaleTimeString()}] Checkpoint at ${i}/${transData.translations.length}`);
      
      // Small pause to avoid rate limiting
      await sleep(1000);
    }

    // Rate limiting
    if (i % 3 === 0) {
      await sleep(500);
    }
  }

  // Save final output
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(`\n\nWoolsey-style refinement complete!`);
  console.log(`Refined ${output.translations.filter(t => t.wasRefined).length} strings`);
  console.log(`Output: ${OUTPUT}`);

  // Clean up checkpoint
  if (fs.existsSync(CHECKPOINT)) {
    fs.unlinkSync(CHECKPOINT);
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
