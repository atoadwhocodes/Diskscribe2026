# 📦 Packaging Ollama for Offline Distribution

This guide explains how to package Ollama with your Diskscribe2026 app for complete offline use.

## 🎯 Overview

Your users can use Diskscribe2026 completely offline with bundled Ollama translation:
- No internet required (after initial setup)
- No API keys needed
- Unlimited free translation
- Works on Windows, Mac, Linux

---

## 📋 Distribution Options

### Option 1: Installer with Ollama (Recommended)

Bundle Ollama installer with your app:

```
YourApp/
├── DiskscribeSetup.exe          # Your app installer
├── OllamaSetup.exe              # Ollama installer
├── models/
│   └── gemma2-9b.gguf          # Pre-downloaded model (9GB)
└── install.ps1                  # Automated setup script
```

**Pros:** Clean, professional, automated
**Cons:** Large download (9-10GB total)

### Option 2: Portable Bundle

Create a fully portable package:

```
Diskscribe2026-Portable/
├── diskscribe.exe
├── ollama.exe                   # Portable Ollama
├── models/
│   └── gemma2-9b/              # Model files
├── translate-offline.js
└── run.bat                      # Launch script
```

**Pros:** No installation, USB-portable
**Cons:** Larger file size, more complex setup

### Option 3: Setup Script (Easiest)

Provide users with automatic installer:

```powershell
# User downloads your app, runs one command:
.\setup-translation-offline.ps1
```

**Pros:** Simplest for you, automatic for users
**Cons:** Requires internet for initial download

---

## 🔧 Implementation Guide

### Step 1: Create Installer Script

Save as `setup-translation-offline.ps1`:

```powershell
# Auto-download and setup Ollama for offline translation

$ErrorActionPreference = 'Stop'

Write-Host "🎮 Diskscribe2026 - Offline Translation Setup" -ForegroundColor Cyan
Write-Host "============================================`n"

# Download Ollama
$ollamaUrl = "https://ollama.com/download/OllamaSetup.exe"
$installerPath = "$env:TEMP\OllamaSetup.exe"

Write-Host "📥 Downloading Ollama..."
Invoke-WebRequest -Uri $ollamaUrl -OutFile $installerPath

Write-Host "🔧 Installing Ollama..."
Start-Process -FilePath $installerPath -Wait

Write-Host "`n📦 Downloading translation model (9GB)..."
Start-Process ollama -ArgumentList "pull gemma2:9b" -Wait

Write-Host "`n✅ Setup complete! Translation is ready and works offline."
Write-Host "Run: node translate-offline.js`n"
```

### Step 2: Add to Your App

In your Electron/Desktop app:

```javascript
// src/translation-offline-manager.js
const { spawn } = require('child_process');
const path = require('path');

class OfflineTranslationManager {
  constructor() {
    this.ollamaPort = 11434;
    this.ollamaProcess = null;
  }

  async startOllama() {
    // Check if Ollama is installed
    const ollamaPath = this.findOllamaExecutable();
    
    if (!ollamaPath) {
      throw new Error('Ollama not installed. Please run setup script.');
    }

    // Start Ollama server
    this.ollamaProcess = spawn(ollamaPath, ['serve'], {
      detached: true,
      stdio: 'ignore'
    });

    // Wait for server to be ready
    await this.waitForOllama();
  }

  findOllamaExecutable() {
    // Windows
    const windowsPath = path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe');
    if (fs.existsSync(windowsPath)) return windowsPath;

    // Mac
    const macPath = '/usr/local/bin/ollama';
    if (fs.existsSync(macPath)) return macPath;

    // Linux
    const linuxPath = '/usr/bin/ollama';
    if (fs.existsSync(linuxPath)) return linuxPath;

    return null;
  }

  async waitForOllama() {
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://localhost:${this.ollamaPort}/api/tags`);
        if (response.ok) return true;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Ollama failed to start');
  }

  async translateText(text) {
    const response = await fetch(`http://localhost:${this.ollamaPort}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma2:9b',
        prompt: `Translate to English: ${text}`,
        stream: false
      })
    });

    const data = await response.json();
    return data.response.trim();
  }

  cleanup() {
    if (this.ollamaProcess) {
      this.ollamaProcess.kill();
    }
  }
}

module.exports = OfflineTranslationManager;
```

### Step 3: Integrate with Your UI

```javascript
// In your Electron main process
const OfflineTranslationManager = require('./translation-offline-manager');

let translationManager;

app.on('ready', async () => {
  translationManager = new OfflineTranslationManager();
  
  try {
    await translationManager.startOllama();
    console.log('✅ Offline translation ready');
  } catch (error) {
    console.error('Translation setup needed:', error.message);
    // Show setup dialog to user
  }
});

app.on('quit', () => {
  if (translationManager) {
    translationManager.cleanup();
  }
});
```

---

## 📦 Distribution Sizes

| Package Type | Size | Download Time* |
|--------------|------|----------------|
| App Only | ~50MB | 30 sec |
| + Ollama | ~500MB | 5 min |
| + Model (gemma2:9b) | ~9GB | 30-60 min |
| **Total Bundle** | **~9.5GB** | **35-65 min** |

*On typical broadband connection

---

## 🚀 Alternative: Smaller Models

For smaller downloads, offer model options:

| Model | Size | Quality | Speed |
|-------|------|---------|-------|
| **gemma2:9b** | 9GB | ⭐⭐⭐⭐⭐ | Medium |
| mistral:7b | 7GB | ⭐⭐⭐⭐ | Fast |
| qwen2.5:7b | 7GB | ⭐⭐⭐⭐⭐ | Medium |
| phi3:3.8b | 3.8GB | ⭐⭐⭐ | Very Fast |

Users can choose based on their needs:
```powershell
# During setup, prompt user:
ollama pull gemma2:9b    # Best quality (recommended)
# OR
ollama pull mistral:7b   # Smaller download, faster
```

---

## 🔒 License Considerations

✅ **All clear for commercial use:**
- Ollama: MIT License (free for commercial use)
- Gemma 2: Open model, commercial use allowed
- Mistral: Apache 2.0 (commercial use allowed)
- Your app: You own and control distribution

No licensing issues - you can bundle freely!

---

## 📝 User Documentation Template

Include this in your README:

```markdown
## Translation (Offline)

Diskscribe2026 includes free, unlimited offline translation powered by Ollama.

### First-Time Setup (One-time, 30-60 minutes)

1. Run the setup script:
   ```
   .\setup-translation-offline.ps1
   ```

2. Wait for download (9GB model, ~30-60 min)

3. Done! Translation now works completely offline.

### Daily Use

Translation runs automatically. No internet connection needed after setup.

### System Requirements

- Disk Space: 10GB free
- RAM: 8GB minimum, 16GB recommended
- GPU: Optional (10x faster with NVIDIA/AMD GPU)
```

---

## 🎯 Complete Distribution Checklist

- [ ] Include `translate-offline.js` in your app
- [ ] Add `setup-translation-offline.ps1` installer
- [ ] Document system requirements (10GB disk, 8GB RAM)
- [ ] Add "Setup Translation" button in UI
- [ ] Show progress bar during model download
- [ ] Test on clean Windows/Mac/Linux installs
- [ ] Add offline/online indicator in UI
- [ ] Include model switching option (advanced users)
- [ ] Add cache management (limit size)
- [ ] Test with no internet connection

---

## 💡 User Experience Tips

**On First Launch:**
```
┌─────────────────────────────────────┐
│  🎮 Welcome to Diskscribe2026!     │
│                                     │
│  For translation, we need to        │
│  download a 9GB language model      │
│  (one-time, ~30 minutes)            │
│                                     │
│  After this, everything works       │
│  offline and is completely free!    │
│                                     │
│  [Setup Now] [Skip for Now]         │
└─────────────────────────────────────┘
```

**During Download:**
```
Downloading translation model...
████████░░░░░░░░░░ 45% (4.2GB / 9GB)
Estimated time: 15 minutes

This is a one-time download.
Translation will work offline after this.
```

**After Setup:**
```
✅ Translation Ready (Offline)
   Translating game: ~6-12 hours
   Works without internet
```

---

## 🔧 Troubleshooting Guide

Include this for users:

**"Ollama not found"**
- Reinstall using setup script
- Check installation: `ollama --version`

**"Model not found"**
- Run: `ollama pull gemma2:9b`
- Check models: `ollama list`

**"Translation is slow"**
- Close other apps (needs RAM)
- GPU highly recommended
- Try smaller model: `phi3:3.8b`

**"Out of disk space"**
- Models need 10GB free space
- Use external drive if needed
- Set custom model location

---

## 🎊 Benefits for Your Users

✅ **Free Forever** - No API costs, no subscriptions
✅ **Offline** - Works on planes, remote locations
✅ **Private** - Data never leaves their computer
✅ **Unlimited** - Translate unlimited games
✅ **No Account** - No registration or login needed
✅ **Fast** - Especially with GPU

This is a major feature for your app! 🚀
