const fs = require('fs');
const path = require('path');

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/bootstrap-translation-project.js',
      '    --project-id <id>',
      '    --name <display name>',
      '    --out <directory>',
      '    [--input <path>]...',
      '    [--partial <path>]...',
      '    [--profile <profile_id>]',
      '    [--container <container_type>]',
      '    [--source-lang <code>]',
      '    [--target-lang <code>]',
      '    [--provider <name>]'
    ].join('\n')
  );
}

function parseArgs(argv) {
  const options = {
    input: [],
    partial: [],
    profile: 'generic_translation',
    container: 'generic',
    sourceLang: 'ja',
    targetLang: 'en',
    provider: 'manual'
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--project-id':
        options.projectId = next;
        index++;
        break;
      case '--name':
        options.name = next;
        index++;
        break;
      case '--out':
        options.out = next;
        index++;
        break;
      case '--input':
        options.input.push(next);
        index++;
        break;
      case '--partial':
        options.partial.push(next);
        index++;
        break;
      case '--profile':
        options.profile = next;
        index++;
        break;
      case '--container':
        options.container = next;
        index++;
        break;
      case '--source-lang':
        options.sourceLang = next;
        index++;
        break;
      case '--target-lang':
        options.targetLang = next;
        index++;
        break;
      case '--provider':
        options.provider = next;
        index++;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.projectId || !options.name || !options.out) {
    usage();
    throw new Error('Missing required arguments');
  }

  return options;
}

function ensureFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
}

function toFileRecord(filePath) {
  const stats = fs.statSync(filePath);
  return {
    path: path.resolve(filePath),
    fileName: path.basename(filePath),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString()
  };
}

function extractSection(lines, heading) {
  const startIndex = lines.findIndex((line) => line.trim() === heading);
  if (startIndex < 0) {
    return [];
  }

  const section = [];
  for (let index = startIndex + 1; index < lines.length; index++) {
    const line = lines[index];
    if (/^##\s+/.test(line.trim())) {
      break;
    }
    section.push(line);
  }
  return section;
}

function parseBankTargets(markdown) {
  const lines = markdown.split(/\r?\n/);
  const section = extractSection(lines, '## Current bank targets');

  return section
    .map((line) => line.trim())
    .filter((line) => /^- `?0x[0-9a-f]+`?/i.test(line))
    .map((line) => {
      const match = line.match(/^- `?(0x[0-9a-f]+)`?\s+(.+)$/i);
      if (!match) {
        return null;
      }

      return {
        offset: match[1].toLowerCase(),
        label: match[2].trim()
      };
    })
    .filter(Boolean);
}

function parseTokenHints(markdown) {
  const lines = markdown.split(/\r?\n/);
  const section = extractSection(lines, '## Token hints');

  return section
    .map((line) => line.trim())
    .filter((line) => /^- `\[.+\]` = /.test(line))
    .map((line) => {
      const match = line.match(/^- `(.+)` = (.+)$/);
      if (!match) {
        return null;
      }

      return {
        token: match[1],
        meaning: match[2].trim()
      };
    })
    .filter(Boolean);
}

function buildProjectReadme(project, partialFiles, bankTargets) {
  const lines = [];
  lines.push(`# ${project.name}`);
  lines.push('');
  lines.push(`Project ID: \`${project.project_id}\``);
  lines.push('');
  lines.push('## Source Media');
  lines.push('');

  for (const input of project.inputs) {
    lines.push(`- \`${input.fileName}\` (${input.size} bytes)`);
    lines.push(`  Source: \`${input.path}\``);
  }

  lines.push('');
  lines.push('## Imported Partials');
  lines.push('');

  if (partialFiles.length === 0) {
    lines.push('- None');
  } else {
    for (const partial of partialFiles) {
      lines.push(`- \`${partial.fileName}\``);
      lines.push(`  Source: \`${partial.path}\``);
    }
  }

  lines.push('');
  lines.push('## Current Extraction Targets');
  lines.push('');

  if (bankTargets.length === 0) {
    lines.push('- No bank targets parsed from partial notes yet.');
  } else {
    for (const target of bankTargets) {
      lines.push(`- \`${target.offset}\` ${target.label}`);
    }
  }

  lines.push('');
  lines.push('## Next Step');
  lines.push('');
  lines.push('- Build or import the CloneCD extraction scripts referenced by the partial notes.');
  lines.push('- Extract a first machine-readable string table before starting translation merges.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, '..');
  const outDir = path.resolve(repoRoot, options.out);
  const notesDir = path.join(outDir, 'notes');
  const researchDir = path.join(outDir, 'research');

  for (const inputPath of options.input) {
    ensureFile(inputPath, 'Input file');
  }

  for (const partialPath of options.partial) {
    ensureFile(partialPath, 'Partial file');
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(notesDir, { recursive: true });
  fs.mkdirSync(researchDir, { recursive: true });

  const inputs = options.input.map(toFileRecord);
  const partialFiles = options.partial.map(toFileRecord);
  const importedNotes = [];
  const bankTargets = [];
  const tokenHints = [];

  for (const partial of partialFiles) {
    const sourcePath = partial.path;
    const targetPath = path.join(notesDir, partial.fileName);
    const content = fs.readFileSync(sourcePath, 'utf8');

    fs.writeFileSync(targetPath, content, 'utf8');

    importedNotes.push({
      ...partial,
      importedTo: path.relative(outDir, targetPath).replace(/\\/g, '/')
    });

    bankTargets.push(...parseBankTargets(content));
    tokenHints.push(...parseTokenHints(content));
  }

  const now = new Date().toISOString();
  const project = {
    project_id: options.projectId,
    name: options.name,
    description: `${options.name} translation bootstrap workspace`,
    created_at: now,
    updated_at: now,
    config: {
      input_path: inputs[0] ? inputs[0].path : '',
      container_type: options.container,
      profile_id: options.profile,
      source_lang: options.sourceLang,
      target_lang: options.targetLang,
      provider: options.provider
    },
    stages: {
      extraction: {
        status: 'pending'
      },
      translation: {
        status: 'pending'
      },
      layout: {
        status: 'pending'
      },
      patching: {
        status: 'pending'
      }
    },
    inputs,
    partials: importedNotes,
    research: {
      bankTargets,
      tokenHints
    }
  };

  fs.writeFileSync(path.join(outDir, 'project.json'), JSON.stringify(project, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(researchDir, 'bank-targets.json'),
    JSON.stringify(
      {
        generatedAt: now,
        projectId: options.projectId,
        targets: bankTargets
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(researchDir, 'token-hints.json'),
    JSON.stringify(
      {
        generatedAt: now,
        projectId: options.projectId,
        hints: tokenHints
      },
      null,
      2
    ),
    'utf8'
  );
  fs.writeFileSync(
    path.join(outDir, 'README.md'),
    buildProjectReadme(project, partialFiles, bankTargets),
    'utf8'
  );

  console.log(`Bootstrapped translation project at ${outDir}`);
}

main();
