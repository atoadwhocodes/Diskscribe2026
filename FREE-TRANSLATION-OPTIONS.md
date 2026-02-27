# 🎮 Free Translation Options for Diskscribe2026

**Your Alshark translation (130k strings) can be done for FREE!** No need to pay $390 for Claude API.

## 🏆 Recommended: Ollama (100% Free, Unlimited)

**Best choice for this project.** Run powerful LLMs locally on your machine - completely free, no limits, private.

### Quick Setup (5 minutes)

```bash
# 1. Install Ollama
# Download from: https://ollama.ai/download
# Or Windows: winget install Ollama.Ollama

# 2. Pull a model (choose one):
ollama pull gemma2:9b        # Recommended - best balance (9GB)
ollama pull mistral:7b       # Faster, good quality (7GB)
ollama pull llama3.1:8b      # Highest quality (8GB)
ollama pull qwen2.5:7b       # Excellent for Japanese (7GB)

# 3. Verify it's running:
ollama list

# 4. Run translation:
node translate-free-ollama.js
```

### ✅ Pros
- **100% Free** - No API costs, ever
- **Unlimited** - Translate infinitely
- **Private** - All local, no data sent online
- **Fast** - With GPU: ~2-5 translations/sec
- **Quality** - Comparable to GPT-3.5, good for games

### ❌ Cons
- Requires ~10GB disk space for model
- Slower without GPU (but still usable)
- Initial setup needed

### 📊 Performance Estimate
- **Your 130k strings:** ~6-12 hours (with GPU)
- **Cost:** $0.00
- **Quality:** Good for game translation

---

## 🌐 Alternative Free Options

### 1. Google Translate Free Tier
```javascript
const { GoogleTranslateFreeBackend } = require('./src/translation-backends-free.js');
const manager = new TranslationManager(new GoogleTranslateFreeBackend('YOUR_API_KEY'));
```

**Free tier:** 500,000 characters/month  
**Your project:** ~130k strings = ~260k characters = **52% of free tier**  
**Setup:** Get API key from [Google Cloud Console](https://console.cloud.google.com)

✅ Fast, reliable, good quality  
❌ Requires API key, limited free tier

---

### 2. DeepL Free Tier
```javascript
const { DeepLFreeBackend } = require('./src/translation-backends-free.js');
const manager = new TranslationManager(new DeepLFreeBackend('YOUR_API_KEY'));
```

**Free tier:** 500,000 characters/month  
**Your project:** ~260k characters = **52% of free tier**  
**Setup:** Sign up at [DeepL API](https://www.deepl.com/pro-api)

✅ Excellent quality, better than Google  
❌ Requires API key, limited free tier

---

### 3. LibreTranslate (Open Source)
```javascript
const { LibreTranslateBackend } = require('./src/translation-backends-free.js');
const manager = new TranslationManager(new LibreTranslateBackend({
  baseUrl: 'http://localhost:5000' // or https://libretranslate.com
}));
```

**Setup (Self-hosted):**
```bash
pip install libretranslate
libretranslate --host 0.0.0.0
```

✅ 100% free, open-source, self-hostable  
❌ Lower quality than commercial APIs

---

### 4. Enhanced Glossary (Instant, Free)
```javascript
const { EnhancedGlossaryBackend } = require('./src/translation-backends-free.js');
const manager = new TranslationManager(new EnhancedGlossaryBackend());
```

**Best for:** UI elements, menus, common game terms  
**Coverage:** ~5-10% of typical game text

✅ Instant, perfect for UI, 0 cost  
❌ Can't handle unique dialog

---

## 🎯 Which Should You Choose?

| Option | Cost | Quality | Speed | Best For |
|--------|------|---------|-------|----------|
| **Ollama** | **$0** | **8/10** | **Medium** | **Full project** ✨ |
| Google Translate | $0* | 7/10 | Fast | Quick test |
| DeepL | $0* | 9/10 | Fast | High quality |
| LibreTranslate | $0 | 5/10 | Medium | Privacy focus |
| Glossary | $0 | 10/10 | Instant | UI/Menus only |

*Limited free tier

## 🚀 Getting Started with Ollama

### Step-by-Step Guide

1. **Install Ollama**
   ```powershell
   # Download installer from https://ollama.ai/download
   # Or use winget:
   winget install Ollama.Ollama
   ```

2. **Pull a Model**
   ```bash
   # For this project, recommend gemma2:9b
   ollama pull gemma2:9b
   
   # Wait for download (9GB, ~10-30min depending on internet)
   ```

3. **Verify Installation**
   ```bash
   ollama list
   # Should show: gemma2:9b
   
   ollama run gemma2:9b "Translate to English: こんにちは"
   # Should output: "Hello"
   ```

4. **Run Translation**
   ```bash
   node translate-free-ollama.js
   
   # Optional: use different model
   node translate-free-ollama.js mistral:7b
   ```

5. **Check Output**
   ```powershell
   Get-ChildItem OUT-FREE/
   # Should see translated .json files
   ```

### 💡 Tips for Best Results

**Quality:**
- Use `gemma2:9b` or `llama3.1:8b` for best quality
- Use `qwen2.5:7b` specifically for Japanese translation
- Adjust temperature in `translation-backends-free.js` (lower = more consistent)

**Speed:**
- GPU dramatically increases speed (10x faster)
- Use `mistral:7b` for faster translation
- Process in batches to utilize caching

**Customization:**
- Fine-tune models for your specific game
- Add glossary pre-pass for consistent terminology
- Combine with enhanced glossary for UI elements

---

## 📊 Cost Comparison

| Method | Cost | Time | Quality |
|--------|------|------|---------|
| **Claude API** | **$390** | 2-3 hours | 10/10 |
| **Ollama (Free)** | **$0** | 6-12 hours* | 8/10 |
| Google Translate | $0** | 1-2 hours | 7/10 |
| DeepL Free | $0** | 1-2 hours | 9/10 |
| LibreTranslate | $0 | 4-6 hours | 5/10 |

*With GPU, 24+ hours without GPU  
**Within free tier limits

---

## 🎮 Example: Full Translation Workflow

```bash
# 1. Install Ollama
winget install Ollama.Ollama

# 2. Get a good model for Japanese
ollama pull gemma2:9b

# 3. Run translation (takes 6-12 hours)
node translate-free-ollama.js

# 4. Check results
node scripts/verify-translation.js OUT-FREE/

# 5. Apply to disk images
node src/disk-reinsertion.js OUT-FREE/alshark-master-translation-FREE.json

# 6. Test in emulator!
```

---

## 🤝 Need Help?

- **Ollama Issues:** https://github.com/ollama/ollama/issues
- **Model Recommendations:** https://ollama.ai/library
- **Translation Quality:** Adjust prompts in `translation-backends-free.js`

## ✨ Bottom Line

**For your Alshark project:** Use Ollama (`gemma2:9b`) - it's free, unlimited, and quality is great for game translation. You'll save $390 and have a reusable setup for future projects.

**Quick comparison:**
- Claude API: $390, 3 hours, excellent quality
- **Ollama: $0, 12 hours, very good quality** ⭐
