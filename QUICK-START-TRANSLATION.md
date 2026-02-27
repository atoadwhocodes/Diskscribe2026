# 🚀 QUICK START: Free Translation Setup

## ⚡ Fastest Option: Ollama (100% Free, Unlimited)

### 1. Install Ollama (5 minutes)
```powershell
# Download and install
https://ollama.ai/download/windows

# Or use winget
winget install Ollama.Ollama
```

### 2. Download Model (10-30 minutes)
```powershell
ollama pull gemma2:9b
```

### 3. Run Translation
```powershell
node translate-free-ollama.js
```

⏱️ **Total time:** 6-12 hours for all 130k strings  
💰 **Cost:** $0.00 (vs Claude API $390)

---

## 🎯 Ready to Start?

If Ollama is too big to download, use these instant options:

###Option A: LibreTranslate (No Installation)
```powershell
node translate-with-libretranslate.js
```
✅ Works immediately, no setup  
⚠️ Rate limited, will be slower    

### Option B: Google/DeepL Free Tier
1. Get free API key from:
   - Google: https://console.cloud.google.com  
   - DeepL: https://www.deepl.com/pro-api

2. Use in your script:
```javascript
const { GoogleTranslateFreeBackend } = require('./src/translation-backends-free');
const manager = new TranslationManager(new GoogleTranslateFreeBackend('YOUR_KEY'));
```

---

## 📊 Quick Comparison

| Method | Setup | Time | Cost |
|--------|-------|------|------|
| **Ollama gemma2:9b** | 15 min | 6-12h | $0 ⭐ |
| Google Translate | 5 min | 2h | $0* |
| DeepL | 5 min | 2h | $0* |
| LibreTranslate | 0 min | 12-24h | $0 |

*Within free tier limits (500k chars/month)

---

## 🎮 What Each Command Does

**translate-comprehensive-glossary.js** - Instant, 200+ game terms
- Coverage: ~0-5% (UI elements only)  
- Use for: Menu items, common phrases

**translate-with-libretranslate.js** - No setup required
- Coverage: 100% (rate limited)
- Use for: When you can't install anything

**translate-free-ollama.js** - Best quality, unlimited
- Coverage: 100% 
- Use for: Full professional translation

---

## 💡 My Recommendation

1. **Quick test?** Run `node translate-with-libretranslate.js` right now
2. **Full translation?** Install Ollama (15 min setup, then unlimited free translation forever)

Choose your path and let's translate this game!
