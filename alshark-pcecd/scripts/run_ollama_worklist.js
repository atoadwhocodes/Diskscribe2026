const fs = require('fs');
const path = require('path');
const http = require('http');

const TOKEN_PATTERN = /(?:\[(?:CMD|ARG|EVT|SUB):[0-9A-F]{2}\]|\[(?:BR|LF|END)\]|<[0-9A-F]{2}>|@)/g;
const PLACEHOLDER_PATTERN = /\{\{T\d{2}\}\}/g;

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index++;
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

function cleanModelOutput(text) {
  let value = String(text || '')
    .replace(/^English:\s*/i, '')
    .replace(/^Translation:\s*/i, '')
    .replace(/^Output:\s*/i, '')
    .trim();

  value = value
    .replace(/^```(?:text|plaintext)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  return value.replace(/^["'](.*)["']$/s, '$1').trim();
}

function normalizeSingleLine(text) {
  return String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
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
      response.on('data', (chunk) => {
        data += chunk;
      });
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

function loadOrCreateTranslations(mergeTarget, model) {
  if (!mergeTarget || !fs.existsSync(mergeTarget)) {
    return {
      projectId: 'alshark_pcecd',
      game: 'Alshark',
      platform: 'PC Engine CD',
      provider: 'ollama',
      model,
      updatedAt: new Date().toISOString(),
      translations: []
    };
  }

  return JSON.parse(fs.readFileSync(mergeTarget, 'utf8'));
}

function tokenList(text) {
  return String(text || '').match(TOKEN_PATTERN) || [];
}

function sameTokenSequence(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function validateStoryMarkup(item, text) {
  const expected = Array.isArray(item.requiredTokens) ? item.requiredTokens : tokenList(item.sourceText);
  const actual = tokenList(text);

  if (!sameTokenSequence(expected, actual)) {
    return {
      valid: false,
      reason: `Token mismatch. expected=${expected.join(' ')} actual=${actual.join(' ')}`
    };
  }

  return { valid: true };
}

function splitStoryChunks(text) {
  const source = String(text || '');
  const chunks = [];

  TOKEN_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match = TOKEN_PATTERN.exec(source);

  while (match) {
    if (match.index > lastIndex) {
      chunks.push({
        type: 'text',
        value: source.slice(lastIndex, match.index)
      });
    }

    chunks.push({
      type: 'token',
      value: match[0]
    });

    lastIndex = match.index + match[0].length;
    match = TOKEN_PATTERN.exec(source);
  }

  if (lastIndex < source.length) {
    chunks.push({
      type: 'text',
      value: source.slice(lastIndex)
    });
  }

  TOKEN_PATTERN.lastIndex = 0;
  return chunks;
}

function splitStorySegments(text) {
  const chunks = splitStoryChunks(text);
  const segments = [];

  for (const chunk of chunks) {
    if (chunk.type === 'text' && chunk.value.length > 0) {
      segments.push(chunk.value);
    }
  }

  return { chunks, segments };
}

function placeholderizeStoryText(text) {
  const chunks = splitStoryChunks(text);
  let tokenIndex = 0;
  const placeholders = [];

  const placeholderText = chunks.map((chunk) => {
    if (chunk.type !== 'token') {
      return chunk.value;
    }

    tokenIndex++;
    const marker = `{{T${String(tokenIndex).padStart(2, '0')}}}`;
    placeholders.push({
      marker,
      token: chunk.value
    });
    return marker;
  }).join('');

  return {
    placeholderText,
    placeholders,
    markers: placeholders.map((entry) => entry.marker)
  };
}

function extractPlaceholders(text) {
  return String(text || '').match(PLACEHOLDER_PATTERN) || [];
}

function applyPlaceholders(text, placeholders) {
  let output = String(text || '');
  for (const entry of placeholders) {
    output = output.split(entry.marker).join(entry.token);
  }
  return output;
}

function parseSegmentResponse(text, expectedCount) {
  if (expectedCount === 0) {
    return [];
  }

  const cleaned = String(text || '').replace(/\r/g, '').trim();
  if (!cleaned) {
    throw new Error('Empty segment response');
  }

  const rawLines = cleaned.split('\n').filter((line) => line.trim().length > 0);
  if (expectedCount === 1 && rawLines.length === 1 && !/^S?\d+\s*[|:.-]/.test(rawLines[0].trimStart())) {
    return [rawLines[0].trim()];
  }

  const parsed = new Array(expectedCount);

  for (const rawLine of rawLines) {
    const match = rawLine.trimStart().match(/^S?(\d+)\s*[|:.-](.*)$/);
    if (!match) {
      throw new Error(`Unparseable segment line: ${rawLine.trim()}`);
    }

    const index = Number(match[1]);
    if (!Number.isFinite(index) || index < 1 || index > expectedCount) {
      throw new Error(`Segment index out of range: ${rawLine.trim()}`);
    }

    parsed[index - 1] = match[2];
  }

  const actualCount = parsed.filter((value) => typeof value === 'string').length;
  if (actualCount !== expectedCount) {
    throw new Error(`Segment count mismatch. expected=${expectedCount} actual=${actualCount}`);
  }

  return parsed;
}

function rebuildStoryFromSegments(chunks, translations) {
  let segmentIndex = 0;

  return chunks.map((chunk) => {
    if (chunk.type === 'token') {
      return chunk.value;
    }

    if (!chunk.value.length) {
      return '';
    }

    const translated = translations[segmentIndex] || '';
    segmentIndex++;
    return translated;
  }).join('');
}

function buildStoryPlaceholderPrompt(item) {
  const placeholderized = placeholderizeStoryText(item.sourceText);

  return {
    strategy: 'story_placeholder',
    prompt: `You are translating Japanese PC Engine CD RPG script text into concise natural English.

Rules:
- Output exactly one line
- Preserve every placeholder exactly, in the same order
- Do not remove, rename, or add placeholders
- Keep markers like {{T01}}, {{T02}}, {{T03}} exactly as written
- Only translate the human-readable Japanese text
- No explanations or notes

Placeholder source:
${placeholderized.placeholderText}

Plain Japanese context:
${item.plainJapanese || ''}

English with placeholders preserved:`,
    placeholderized
  };
}

function buildStorySegmentPrompt(item) {
  const { chunks, segments } = splitStorySegments(item.sourceText);
  const skeletonParts = [];
  let tokenIndex = 0;
  let segmentIndex = 0;

  for (const chunk of chunks) {
    if (chunk.type === 'token') {
      tokenIndex++;
      skeletonParts.push(`{{T${String(tokenIndex).padStart(2, '0')}}}`);
    } else if (chunk.value.length > 0) {
      segmentIndex++;
      skeletonParts.push(`{{S${segmentIndex}}}`);
    }
  }

  return {
    strategy: 'story_segments',
    prompt: `You are translating segmented Japanese PC Engine CD RPG script text into concise natural English.

Translate each Japanese segment into English so the full line reads naturally when inserted into the skeleton.

Rules:
- Return exactly ${segments.length} lines
- Each line must use the format S<number>|translation
- Keep the same numbering and order
- Do not output token placeholders from the skeleton
- Leading or trailing spaces inside a segment are allowed if needed around hidden placeholders
- No notes or extra lines

Display skeleton:
${skeletonParts.join('')}

Plain Japanese context:
${item.plainJapanese || ''}

Segments to translate:
${segments.map((segment, index) => `S${index + 1}|${segment}`).join('\n')}`,
    chunks,
    segmentCount: segments.length
  };
}

function buildPrompt(item, strategy) {
  if (item.promptMode === 'story_markup') {
    if (strategy === 'story_segments') {
      return buildStorySegmentPrompt(item);
    }

    return buildStoryPlaceholderPrompt(item);
  }

  return {
    strategy: 'plain',
    prompt: `You are translating Japanese PC Engine CD RPG game text into natural concise English.

Rules:
- Output only the English translation
- Keep names and tone consistent
- Be concise and game-localization friendly
- No notes or quotes unless the line requires them

Japanese:
${item.sourceText}

English:`
  };
}

function finalizeStoryCandidate(item, candidateText, promptData) {
  if (promptData.strategy === 'story_placeholder') {
    const normalized = normalizeSingleLine(candidateText);
    const expected = promptData.placeholderized.markers;
    const actual = extractPlaceholders(normalized);

    if (!sameTokenSequence(expected, actual)) {
      return {
        valid: false,
        reason: `Placeholder mismatch. expected=${expected.join(' ')} actual=${actual.join(' ')}`
      };
    }

    const restored = applyPlaceholders(normalized, promptData.placeholderized.placeholders);
    const validation = validateStoryMarkup(item, restored);
    if (!validation.valid) {
      return validation;
    }

    return {
      valid: true,
      text: restored
    };
  }

  const segments = parseSegmentResponse(candidateText, promptData.segmentCount);
  const restored = rebuildStoryFromSegments(promptData.chunks, segments);
  const validation = validateStoryMarkup(item, restored);
  if (!validation.valid) {
    return validation;
  }

  return {
    valid: true,
    text: restored
  };
}

function buildResult(item, response, model) {
  const result = {
    id: item.id,
    category: item.category,
    promptMode: item.promptMode,
    sourceText: item.sourceText,
    plainJapanese: item.plainJapanese || '',
    fileOffset: item.fileOffset,
    relOffset: item.relOffset,
    model,
    generatedAt: new Date().toISOString(),
    totalDuration: response.totalDuration,
    evalCount: response.evalCount
  };

  if (item.promptMode === 'story_markup') {
    result.translationMarkup = response.text;
    if (response.strategy) {
      result.storyStrategy = response.strategy;
    }
  } else {
    result.translation = normalizeSingleLine(response.text);
  }

  return result;
}

function upsertTranslation(translationData, item, result) {
  const translations = Array.isArray(translationData.translations) ? translationData.translations : [];
  const index = translations.findIndex((entry) => String(entry.id || '').toLowerCase() === String(item.id || '').toLowerCase());
  const next = index >= 0 ? { ...translations[index] } : {
    id: item.id,
    category: item.category,
    fileOffset: item.fileOffset,
    relOffset: item.relOffset,
    sourceText: item.sourceText,
    plainJapanese: item.plainJapanese || ''
  };

  next.model = result.model;
  next.promptMode = item.promptMode;
  next.updatedAt = result.generatedAt;

  if (item.promptMode === 'story_markup') {
    next.translationMarkup = result.translationMarkup;
    if (result.storyStrategy) {
      next.storyStrategy = result.storyStrategy;
    }
  } else {
    next.translation = result.translation;
  }

  if (index >= 0) {
    translations[index] = next;
  } else {
    translations.push(next);
  }

  translationData.translations = translations;
  translationData.updatedAt = new Date().toISOString();
  translationData.count = translations.length;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args.input ? path.resolve(String(args.input)) : '';
  const checkpointPath = args.checkpoint ? path.resolve(String(args.checkpoint)) : '';
  const outputPath = args.output ? path.resolve(String(args.output)) : '';
  const mergeTarget = args['merge-target'] ? path.resolve(String(args['merge-target'])) : '';
  const apply = Boolean(args.apply);
  const limit = args.limit ? Number(args.limit) : Infinity;

  if (!inputPath || !fs.existsSync(inputPath)) {
    throw new Error(`Input worklist not found: ${inputPath}`);
  }

  const model = args.model || 'gemma3:12b';
  const host = args.host || '127.0.0.1';
  const port = Number(args.port || 11434);
  const timeoutMs = Number(args.timeout || 600000);
  const checkpointEvery = Number(args['checkpoint-every'] || 5);
  const maxRetries = Number(args.retries || 3);
  const delayMs = Number(args.delay || 250);
  const temperature = Number(args.temperature || 0.2);
  const numPredict = Number(args['num-predict'] || 160);
  const topP = Number(args['top-p'] || 0.9);
  const repeatPenalty = Number(args['repeat-penalty'] || 1.05);
  const numThread = Number(args['num-thread'] || 12);
  const generationOptions = {
    temperature,
    num_predict: numPredict,
    top_p: topP,
    repeat_penalty: repeatPenalty,
    num_thread: numThread
  };

  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const items = Array.isArray(input.strings) ? input.strings : [];
  const checkpoint = loadCheckpoint(checkpointPath);
  const results = Array.isArray(checkpoint.results) ? checkpoint.results.slice() : [];
  const translationsData = apply && mergeTarget ? loadOrCreateTranslations(mergeTarget, model) : null;

  console.log('=== Alshark PCE-CD Ollama Runner ===');
  console.log(`model=${model}`);
  console.log(`input=${inputPath}`);
  console.log(`items=${items.length} resumeIndex=${checkpoint.index}`);

  if (checkpoint.index === 0) {
    const warmup = await ollamaGenerate({
      host,
      port,
      model,
      prompt: 'Say ready.',
      timeoutMs,
      options: generationOptions
    });
    console.log(`warmup=${normalizeSingleLine(warmup.text)}`);
  }

  const maxIndex = Number.isFinite(limit)
    ? Math.min(items.length, checkpoint.index + limit)
    : items.length;

  let processed = 0;
  let errors = 0;

  for (let index = checkpoint.index; index < maxIndex; index++) {
    const item = items[index];
    let response = null;
    let lastError = null;

    if (item.promptMode === 'story_markup' && splitStorySegments(item.sourceText).segments.length === 0) {
      response = {
        text: item.sourceText,
        totalDuration: 0,
        evalCount: 0,
        strategy: 'story_passthrough'
      };
    } else {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const promptData = buildPrompt(
            item,
            item.promptMode === 'story_markup' && attempt > 0 ? 'story_placeholder' : 'story_segments'
          );

          const candidate = await ollamaGenerate({
            host,
            port,
            model,
            prompt: promptData.prompt,
            timeoutMs,
            options: generationOptions
          });

          if (!candidate.text) {
            throw new Error('Empty model response');
          }

          if (item.promptMode === 'story_markup') {
            const validation = finalizeStoryCandidate(item, candidate.text, promptData);
            if (!validation.valid) {
              throw new Error(validation.reason);
            }

            candidate.text = validation.text;
            candidate.strategy = promptData.strategy;
          }

          response = candidate;
          break;
        } catch (error) {
          lastError = error;
          if (attempt < maxRetries - 1) {
            await sleep(3000);
          }
        }
      }
    }

    if (!response) {
      errors++;
      results.push({
        id: item.id,
        category: item.category,
        promptMode: item.promptMode,
        sourceText: item.sourceText,
        error: lastError ? lastError.message : 'Unknown error',
        generatedAt: new Date().toISOString(),
        model
      });
    } else {
      const result = buildResult(item, response, model);
      results.push(result);

      if (apply && translationsData && mergeTarget) {
        upsertTranslation(translationsData, item, result);
        ensureParentDir(mergeTarget);
        fs.writeFileSync(mergeTarget, JSON.stringify(translationsData, null, 2));
      }
    }

    processed++;
    const nextIndex = index + 1;

    if (processed % checkpointEvery === 0 || nextIndex >= maxIndex) {
      saveCheckpoint(checkpointPath, {
        index: nextIndex,
        model,
        updatedAt: new Date().toISOString(),
        results
      });

      if (outputPath) {
        ensureParentDir(outputPath);
        fs.writeFileSync(outputPath, JSON.stringify({
          generatedAt: new Date().toISOString(),
          model,
          source: inputPath,
          processed: nextIndex,
          results
        }, null, 2));
      }
    }

    await sleep(delayMs);
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
