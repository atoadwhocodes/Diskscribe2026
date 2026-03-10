const fs = require('fs');
const path = require('path');
const http = require('http');

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    i++;
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureParentDir(filePath) {
  if (!filePath) {
    return;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ''), 'ascii');
}

function halfKatakanaToHiragana(str) {
  const map = {
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
  };
  const dakuten = {
    'か': 'が', 'き': 'ぎ', 'く': 'ぐ', 'け': 'げ', 'こ': 'ご',
    'さ': 'ざ', 'し': 'じ', 'す': 'ず', 'せ': 'ぜ', 'そ': 'ぞ',
    'た': 'だ', 'ち': 'ぢ', 'つ': 'づ', 'て': 'で', 'と': 'ど',
    'は': 'ば', 'ひ': 'び', 'ふ': 'ぶ', 'へ': 'べ', 'ほ': 'ぼ',
    'う': 'ゔ'
  };
  const handakuten = {
    'は': 'ぱ', 'ひ': 'ぴ', 'ふ': 'ぷ', 'へ': 'ぺ', 'ほ': 'ぽ'
  };

  let result = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];
    if (map[ch]) {
      let fw = map[ch];
      if (next === 'ﾞ' && dakuten[fw]) {
        fw = dakuten[fw];
        i++;
      } else if (next === 'ﾟ' && handakuten[fw]) {
        fw = handakuten[fw];
        i++;
      }
      result += fw;
    } else {
      result += ch;
    }
  }
  return result;
}

function cleanForTranslation(text) {
  let cleaned = String(text || '')
    .replace(/#[A-Z][0-9A-Z]*/g, '')
    .replace(/\?[0-9A-Z]/g, '')
    .replace(/![0-9A-Z@_#]/g, '')
    .replace(/_「/g, '「')
    .replace(/_([0-9])/g, ' ')
    .replace(/@/g, ' ')
    .replace(/\\/g, ' ')
    .replace(/\$./g, '')
    .replace(/%./g, '')
    .replace(/[0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return halfKatakanaToHiragana(cleaned);
}

function cleanModelOutput(text) {
  let value = String(text || '')
    .replace(/^English:\s*/i, '')
    .replace(/^Translation:\s*/i, '')
    .replace(/^Short English:\s*/i, '')
    .replace(/^Patch text:\s*/i, '')
    .replace(/^Output:\s*/i, '');

  value = value.replace(/^["'](.*)["']$/s, '$1');
  value = value.split('\n').map((line) => line.trim()).filter(Boolean)[0] || value;
  return value.replace(/\s+/g, ' ').trim();
}

function buildPrompt(mode, item) {
  if (mode === 'polish-fit') {
    return `You are polishing an English translation for a 1991 Japanese RPG.

Rewrite the current English line into shorter natural English that preserves the meaning and tone.

Rules:
- Output ONLY the rewritten English line
- It should fit within ${item.capacity} ASCII characters if possible
- Keep proper nouns and speaker intent
- Use concise game-localization wording
- Avoid notes, quotes, or explanations

Japanese: ${cleanForTranslation(item.sourceText)}
Current English: ${item.effectiveText}
ASCII limit: ${item.capacity}
Current overflow: ${item.overflowBytes || 0}
Short English:`;
  }

  return `You are a professional Japanese to English translator specializing in 1990s Japanese RPG video games.

Translate the following Japanese game text into natural, concise English for a 1991 PC-98 sci-fi RPG.

Rules:
- Output ONLY the English translation
- Keep it concise and readable
- Preserve tone and proper nouns
- No notes, no quotes unless required by the line

Japanese: ${cleanForTranslation(item.sourceText)}
English:`;
}

async function googleTranslateText(translate, text) {
  const response = await translate(text, { from: 'ja', to: 'en' });
  return {
    text: cleanModelOutput(response.text || ''),
    totalDuration: 0,
    evalCount: 0
  };
}

function ollamaGenerate({ host, port, model, prompt, timeoutMs, options }) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      prompt,
      stream: false,
      options
    });

    const request = http.request({
      hostname: host,
      port,
      path: '/api/generate',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: timeoutMs
    }, (response) => {
      let data = '';
      response.on('data', (chunk) => data += chunk);
      response.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(json.error));
            return;
          }

          resolve({
            text: cleanModelOutput(json.response || ''),
            totalDuration: json.total_duration || 0,
            evalCount: json.eval_count || 0
          });
        } catch (error) {
          reject(new Error(`JSON parse error: ${error.message}`));
        }
      });
    });

    request.on('error', reject);
    request.on('timeout', () => {
      request.destroy();
      reject(new Error('Request timed out'));
    });
    request.write(body);
    request.end();
  });
}

function loadCheckpoint(checkpointPath) {
  if (!checkpointPath || !fs.existsSync(checkpointPath)) {
    return { index: 0, results: [] };
  }

  try {
    const data = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
    return {
      index: Number(data.index || 0),
      results: Array.isArray(data.results) ? data.results : []
    };
  } catch (error) {
    return { index: 0, results: [] };
  }
}

function saveCheckpoint(checkpointPath, checkpoint) {
  if (!checkpointPath) {
    return;
  }

  ensureParentDir(checkpointPath);
  fs.writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 2));
}

function loadOrCreateTranslations(mergeTarget, model, mode) {
  if (!mergeTarget || !fs.existsSync(mergeTarget)) {
    return {
      game: 'Alshark',
      platform: 'PC-98',
      model,
      translated: new Date().toISOString(),
      count: 0,
      errors: 0,
      updatedBy: mode,
      translations: []
    };
  }

  return JSON.parse(fs.readFileSync(mergeTarget, 'utf8'));
}

function upsertTranslation(translationData, result, mode) {
  const list = Array.isArray(translationData.translations) ? translationData.translations : [];
  const index = list.findIndex((entry) => String(entry.id || '').toLowerCase() === String(result.id || '').toLowerCase());
  const current = index >= 0 ? list[index] : {
    id: result.id,
    disk: result.disk,
    offset: result.offset,
    maxBytes: result.maxBytes,
    source: result.sourceText
  };

  const next = { ...current };
  if (!next.source && result.sourceText) {
    next.source = result.sourceText;
  }

  if (mode === 'polish-fit') {
    next.patchText = result.patchText;
    next.patchTextModel = result.model;
    next.patchTextUpdatedAt = result.generatedAt;
  } else {
    next.translation = result.translation;
    next.model = result.model;
    next.translatedAt = result.generatedAt;
  }

  if (index >= 0) {
    list[index] = next;
  } else {
    list.push(next);
  }

  translationData.translations = list;
  translationData.count = list.length;
  translationData.translated = new Date().toISOString();
}

function buildResult(mode, item, response, model) {
  const base = {
    id: item.id,
    disk: item.disk,
    offset: item.offset,
    maxBytes: item.maxBytes,
    sourceText: item.sourceText,
    model,
    generatedAt: new Date().toISOString(),
    totalDuration: response.totalDuration,
    evalCount: response.evalCount
  };

  if (mode === 'polish-fit') {
    return {
      ...base,
      currentTranslation: item.currentTranslation || item.effectiveText || '',
      currentPatchText: item.currentPatchText || '',
      capacity: item.capacity,
      overflowBytesBefore: item.overflowBytes || 0,
      patchText: response.text,
      fits: byteLength(response.text) <= Number(item.capacity || 0)
    };
  }

  return {
    ...base,
    translation: response.text
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode || 'translate';
  const provider = args.provider || (mode === 'translate' ? 'google' : 'ollama');
  const inputArg = String(args.input || '').trim();
  const inputPath = inputArg ? path.resolve(inputArg) : '';
  const checkpointPath = args.checkpoint ? path.resolve(String(args.checkpoint)) : '';
  const outputPath = args.output ? path.resolve(String(args.output)) : '';
  const mergeTarget = args['merge-target'] ? path.resolve(String(args['merge-target'])) : '';
  const limit = args.limit ? Number(args.limit) : Infinity;
  const apply = Boolean(args.apply);

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input worklist not found: ${inputPath}`);
  }
  if (mode !== 'translate' && provider !== 'ollama') {
    throw new Error(`${provider} provider is only supported for translate mode`);
  }

  const model = args.model || (provider === 'google' ? 'google-translate' : 'gemma3:12b');
  const host = args.host || '127.0.0.1';
  const port = Number(args.port || 11434);
  const timeoutMs = Number(args.timeout || 600000);
  const checkpointEvery = Number(args['checkpoint-every'] || 10);
  const maxRetries = Number(args.retries || 3);
  const delayMs = Number(args.delay || 350);
  const generationOptions = {
    temperature: mode === 'polish-fit' ? 0.3 : 0.1,
    num_predict: mode === 'polish-fit' ? 80 : 120,
    top_p: 0.9,
    repeat_penalty: 1.1,
    num_thread: 12
  };

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const items = Array.isArray(input.strings) ? input.strings : [];
  const checkpoint = loadCheckpoint(checkpointPath);
  const results = Array.isArray(checkpoint.results) ? checkpoint.results.slice() : [];
  const translationsData = apply && mergeTarget ? loadOrCreateTranslations(mergeTarget, model, mode) : null;
  const translate = provider === 'google'
    ? (await import('google-translate-api-x')).default
    : null;

  console.log(`=== Alshark Translation Worklist Runner ===`);
  console.log(`mode=${mode} provider=${provider} model=${model}`);
  console.log(`input=${inputPath}`);
  console.log(`items=${items.length} resumeIndex=${checkpoint.index}`);
  if (Number.isFinite(limit)) {
    console.log(`limit=${limit}`);
  }

  if (provider === 'ollama' && checkpoint.index === 0) {
    const warmup = await ollamaGenerate({
      host,
      port,
      model,
      prompt: 'Say ready.',
      timeoutMs,
      options: generationOptions
    });
    console.log(`warmup=${warmup.text}`);
  }

  const maxIndex = Number.isFinite(limit) ? Math.min(items.length, checkpoint.index + limit) : items.length;
  let processed = 0;
  let errors = 0;

  for (let index = checkpoint.index; index < maxIndex; index++) {
    const item = items[index];
    let response = null;
    let lastError = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (provider === 'google') {
          response = await googleTranslateText(translate, cleanForTranslation(item.sourceText));
        } else {
          response = await ollamaGenerate({
            host,
            port,
            model,
            prompt: buildPrompt(mode, item),
            timeoutMs,
            options: generationOptions
          });
        }
        if (!response.text) {
          throw new Error('Empty model response');
        }
        break;
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries - 1) {
          await sleep(provider === 'google' ? 2000 : 5000);
        }
      }
    }

    if (!response) {
      errors++;
      results.push({
        id: item.id,
        disk: item.disk,
        offset: item.offset,
        maxBytes: item.maxBytes,
        sourceText: item.sourceText,
        error: lastError ? lastError.message : 'Unknown error',
        generatedAt: new Date().toISOString(),
        mode,
        model
      });
    } else {
      const result = buildResult(mode, item, response, model);
      results.push(result);

      if (apply && translationsData && mergeTarget) {
        upsertTranslation(translationsData, result, mode);
        ensureParentDir(mergeTarget);
        fs.writeFileSync(mergeTarget, JSON.stringify(translationsData, null, 2));
      }
    }

    processed++;
    const nextIndex = index + 1;

    if (processed % checkpointEvery === 0 || nextIndex >= maxIndex) {
      saveCheckpoint(checkpointPath, {
        index: nextIndex,
        mode,
        model,
        updatedAt: new Date().toISOString(),
        results
      });

      if (outputPath) {
        ensureParentDir(outputPath);
        fs.writeFileSync(outputPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          mode,
          model,
          source: inputPath,
          processed: nextIndex,
          results
        }, null, 2));
      }
    }

    if (provider === 'google') {
      await sleep(delayMs);
    }

    process.stdout.write(`\r[${nextIndex}/${items.length}] processed=${processed} errors=${errors}    `);
  }

  console.log('\nComplete.');
  if (outputPath) {
    console.log(`Output: ${outputPath}`);
  }
  if (checkpointPath) {
    console.log(`Checkpoint: ${checkpointPath}`);
  }
  if (apply && mergeTarget) {
    console.log(`Merged into: ${mergeTarget}`);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
