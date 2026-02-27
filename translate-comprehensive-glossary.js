#!/usr/bin/env node
/**
 * COMPREHENSIVE GLOSSARY TRANSLATION
 * Massive Japanese game vocabulary database for PC-98 games
 * Covers UI, dialog, combat, items, and common phrases
 */

const fs = require('fs');
const path = require('path');

// COMPREHENSIVE TRANSLATION GLOSSARY
const COMPREHENSIVE_GLOSSARY = {
  // ===== UI & MENU SYSTEM =====
  '新しいゲーム': 'New Game',
  'ゲーム再開': 'Continue',
  'はじめから': 'Start New Game',
  'つづきから': 'Continue',
  'つづき': 'Continue',
  'オプション': 'Options',
  '設定': 'Settings',
  'セーブ': 'Save',
  'ロード': 'Load',
  '終了': 'Quit',
  'タイトル': 'Title',
  'タイトルに戻る': 'Return to Title',
  'メニュー': 'Menu',
  'キャンセル': 'Cancel',
  '決定': 'OK',
  '確認': 'Confirm',
  'はい': 'Yes',
  'いいえ': 'No',
  'もどる': 'Back',
  '戻る': 'Back',
  '次へ': 'Next',
  '前へ': 'Previous',
  'やめる': 'Quit',
  '中止': 'Cancel',
  
  // ===== COMBAT SYSTEM =====
  '攻撃': 'Attack',
  '防御': 'Defend',
  '魔法': 'Magic',
  'アイテム': 'Item',
  '道具': 'Item',
  '逃げる': 'Flee',
  '技': 'Skill',
  '特技': 'Special',
  '必殺技': 'Ultimate',
  '戦う': 'Fight',
  '戦闘': 'Battle',
  '勝利': 'Victory',
  '敗北': 'Defeat',
  '勝った': 'Victory!',
  '負けた': 'Defeated...',
  '戦闘開始': 'Battle Start',
  '戦闘終了': 'Battle End',
  '様子を見る': 'Wait',
  '並び替え': 'Rearrange',
  '全体攻撃': 'All Attack',
  '単体攻撃': 'Single Attack',
  
  // ===== STATS & ATTRIBUTES =====
  'HP': 'HP',
  'MP': 'MP',
  'ヒットポイント': 'Hit Points',
  'マジックポイント': 'Magic Points',
  '体力': 'HP',
  '魔力': 'MP',
  '経験値': 'EXP',
  'けいけんち': 'Experience',
  'レベル': 'Level',
  'レベルアップ': 'Level Up',
  '攻撃力': 'Attack',
  '防御力': 'Defense',
  '魔法攻撃': 'Magic Attack',
  '魔法防御': 'Magic Defense',
  '素早さ': 'Speed',
  '運': 'Luck',
  '器用さ': 'Dexterity',
  '知力': 'Intelligence',
  '精神': 'Spirit',
  '生命力': 'Vitality',
  'ステータス': 'Status',
  '能力': 'Abilities',
  '属性': 'Element',
  
  // ===== CHARACTER & PARTY =====
  'キャラクター': 'Character',
  '主人公': 'Hero',
  '勇者': 'Hero',
  '仲間': 'Party',
  'パーティー': 'Party',
  'パーティ': 'Party',
  '装備': 'Equipment',
  'そうび': 'Equipment',
  '装備変更': 'Change Equipment',
  'スキル': 'Skills',
  '特殊能力': 'Special Abilities',
  '所持金': 'Gold',
  'お金': 'Money',
  'ゴールド': 'Gold',
  '所持品': 'Inventory',
  '持ち物': 'Items',
  '名前': 'Name',
  '職業': 'Class',
  '性別': 'Gender',
  '男': 'Male',
  '女': 'Female',
  '年齢': 'Age',
  
  // ===== ITEMS & EQUIPMENT =====
  '武器': 'Weapon',
  '剣': 'Sword',
  '槍': 'Spear',
  '斧': 'Axe',
  '弓': 'Bow',
  '杖': 'Staff',
  '防具': 'Armor',
  '鎧': 'Armor',
  '盾': 'Shield',
  '兜': 'Helmet',
  '服': 'Clothes',
  '靴': 'Boots',
  '指輪': 'Ring',
  'アクセサリー': 'Accessory',
  '薬': 'Medicine',
  '薬草': 'Herb',
  'ポーション': 'Potion',
  '回復薬': 'Healing Potion',
  '毒消し': 'Antidote',
  '万能薬': 'Elixir',
  '鍵': 'Key',
  
  // ===== LOCATIONS =====
  '街': 'Town',
  '町': 'Town',
  '村': 'Village',
  '城': 'Castle',
  'ダンジョン': 'Dungeon',
  '洞窟': 'Cave',
  '森': 'Forest',
  '山': 'Mountain',
  '塔': 'Tower',
  '神殿': 'Temple',
  '遺跡': 'Ruins',
  '店': 'Shop',
  '宿屋': 'Inn',
  '酒場': 'Tavern',
  '武器屋': 'Weapon Shop',
  '防具屋': 'Armor Shop',
  '道具屋': 'Item Shop',
  '魔法屋': 'Magic Shop',
  '教会': 'Church',
  
  // ===== MONSTERS & ENEMIES =====
  '敵': 'Enemy',
  'モンスター': 'Monster',
  '魔物': 'Monster',
  'ボス': 'Boss',
  'スライム': 'Slime',
  'ドラゴン': 'Dragon',
  'ゴブリン': 'Goblin',
  'オーク': 'Orc',
  'スケルトン': 'Skeleton',
  'ゾンビ': 'Zombie',
  'ゴースト': 'Ghost',
  'デーモン': 'Demon',
  '魔王': 'Demon King',
  
  // ===== MAGIC & SPELLS =====
  '魔法': 'Magic',
  '呪文': 'Spell',
  'ファイア': 'Fire',
  '炎': 'Fire',
  'サンダー': 'Thunder',
  '雷': 'Lightning',
  'ブリザード': 'Blizzard',
  '氷': 'Ice',
  'ヒール': 'Heal',
  '回復': 'Heal',
  '治療': 'Cure',
  '蘇生': 'Revive',
  '復活': 'Resurrect',
  '補助': 'Support',
  '強化': 'Enhance',
  '弱体': 'Weaken',
  
  // ===== STATUS CONDITIONS =====
  '毒': 'Poison',
  '麻痺': 'Paralysis',
  '沈黙': 'Silence',
  '混乱': 'Confusion',
  '石化': 'Petrify',
  '眠り': 'Sleep',
  '暗闇': 'Blind',
  '呪い': 'Curse',
  '死亡': 'Dead',
  '戦闘不能': 'KO',
  '正常': 'Normal',
  
  // ===== ACTIONS & VERBS =====
  '話す': 'Talk',
  '調べる': 'Examine',
  '買う': 'Buy',
  '売る': 'Sell',
  '泊まる': 'Stay',
  '休む': 'Rest',
  '使う': 'Use',
  '開ける': 'Open',
  '閉める': 'Close',
  '取る': 'Take',
  '捨てる': 'Discard',
  '入る': 'Enter',
  '出る': 'Exit',
  '行く': 'Go',
  '移動': 'Move',
  
  // ===== COMMON PHRASES =====
  'ようこそ': 'Welcome',
  'いらっしゃい': 'Welcome',
  'こんにちは': 'Hello',
  'さようなら': 'Goodbye',
  'ありがとう': 'Thank you',
  'ごめんなさい': 'Sorry',
  'すみません': 'Excuse me',
  'どうぞ': 'Please',
  'はい、どうぞ': 'Here you go',
  '気をつけて': 'Be careful',
  '頑張って': 'Good luck',
  'おめでとう': 'Congratulations',
  'お疲れ様': 'Good work',
  'やった': 'Yes!',
  'しまった': 'Oh no!',
  'まさか': 'No way!',
  'なるほど': 'I see',
  '本当': 'Really',
  'もちろん': 'Of course',
  
  // ===== QUESTIONS & RESPONSES =====
  'どうする': 'What will you do?',
  'どれにする': 'Which one?',
  'いいですか': 'Is that okay?',
  'よろしい': 'Alright?',
  'わかった': 'Understood',
  'わかりました': 'I understand',
  'そうか': 'I see',
  'そうだ': "That's right",
  'ちがう': 'Wrong',
  'だめだ': 'No good',
  
  // ===== NUMBERS =====
  '一つ': 'One',
  '二つ': 'Two',
  '三つ': 'Three',
  '四つ': 'Four',
  '五つ': 'Five',
  '１': '1',
  '２': '2',
  '３': '3',
  '４': '4',
  '５': '5',
  '６': '6',
  '７': '7',
  '８': '8',
  '９': '9',
  '０': '0',
  
  // ===== TIME & DIRECTION =====
  '今': 'Now',
  '昔': 'Long ago',
  '未来': 'Future',
  '過去': 'Past',
  '朝': 'Morning',
  '昼': 'Noon',
  '夜': 'Night',
  '北': 'North',
  '南': 'South',
  '東': 'East',
  '西': 'West',
  '上': 'Up',
  '下': 'Down',
  '左': 'Left',
  '右': 'Right',
  
  // ===== GAME SPECIFIC =====
  'クリア': 'Clear',
  'ゲームオーバー': 'Game Over',
  'コンティニュー': 'Continue',
  'リトライ': 'Retry',
  'スタート': 'Start',
  'ポーズ': 'Pause',
  'ヘルプ': 'Help',
  'マップ': 'Map',
  '情報': 'Info',
  '説明': 'Description',
  '詳細': 'Details',
  '一覧': 'List',
  '選択': 'Select',
  '全員': 'All',
  '効果': 'Effect',
  '範囲': 'Range',
  '対象': 'Target',
  '威力': 'Power',
  '命中': 'Accuracy',
  '回避': 'Evasion',
};

// SENTENCE PATTERNS
const SENTENCE_PATTERNS = [
  { jp: 'を手に入れた', en: 'obtained' },
  { jp: 'を倒した', en: 'defeated' },
  { jp: 'が現れた', en: 'appeared' },
  { jp: 'を使った', en: 'used' },
  { jp: 'がいる', en: 'is here' },
  { jp: 'がない', en: 'is not here' },
  { jp: 'ができる', en: 'can do' },
  { jp: 'ができない', en: 'cannot do' },
  { jp: 'はどうする', en: 'What will you do?' },
  { jp: 'が言った', en: 'said' },
  { jp: 'に話しかけた', en: 'talked to' },
  { jp: 'を調べた', en: 'examined' },
  { jp: 'を開けた', en: 'opened' },
  { jp: 'が見つかった', en: 'was found' },
  { jp: 'ポイント', en: 'points' },
  { jp: 'の攻撃', en: "'s attack" },
  { jp: 'の魔法', en: "'s magic" },
  { jp: 'のダメージ', en: ' damage' },
];

// PARTICLE TRANSLATIONS
const PARTICLES = {
  'は': ' ',
  'が': ' ',
  'を': ' ',
  'に': ' to ',
  'へ': ' to ',
  'で': ' at ',
  'と': ' and ',
  'や': ' and ',
  'の': "'s ",
  'も': ' also ',
};

function translateText(japaneseText) {
  if (!japaneseText || japaneseText.length < 1) return '';
  
  // Skip kanji placeholders
  if (japaneseText.startsWith('[漢:')) return '';
  
  // Check exact match first
  if (COMPREHENSIVE_GLOSSARY[japaneseText]) {
    return COMPREHENSIVE_GLOSSARY[japaneseText];
  }
  
  let result = japaneseText;
  let translated = false;
  
  // Apply glossary replacements (longest first)
  const sortedGlossary = Object.entries(COMPREHENSIVE_GLOSSARY)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [jp, en] of sortedGlossary) {
    if (result.includes(jp)) {
      result = result.replace(new RegExp(jp, 'g'), en);
      translated = true;
    }
  }
  
  // Apply sentence patterns
  for (const pattern of SENTENCE_PATTERNS) {
    if (result.includes(pattern.jp)) {
      result = result.replace(new RegExp(pattern.jp, 'g'), pattern.en);
      translated = true;
    }
  }
  
  // Clean up particles if we made translations
  if (translated) {
    for (const [jp, en] of Object.entries(PARTICLES)) {
      result = result.replace(new RegExp(jp, 'g'), en);
    }
    
    // Clean up extra spaces
    result = result.replace(/\s+/g, ' ').trim();
  }
  
  return result || japaneseText;
}

async function processFile(filePath) {
  const fileName = path.basename(filePath);
  console.log(`\n📂 Processing: ${fileName}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const strings = Array.isArray(data) ? data : [];
  
  if (strings.length === 0) {
    console.log('  ⚠️  No strings found, skipping');
    return null;
  }
  
  let total = 0;
  let translated = 0;
  let skipped = 0;
  
  const result = strings.map(str => {
    total++;
    
    if (!str.text || str.text.length < 2 || str.text.startsWith('[漢:')) {
      skipped++;
      return { ...str, translation: '', status: 'skipped' };
    }
    
    const translation = translateText(str.text);
    
    if (translation && translation !== str.text && !translation.match(/[\u3040-\u309F\u30A0-\u30FF]/)) {
      translated++;
      return { ...str, translation, status: 'translated' };
    }
    
    return { ...str, translation: '', status: 'untranslated' };
  });
  
  console.log(`  ✅ ${translated}/${total} translated (${((translated/total)*100).toFixed(1)}%)`);
  console.log(`  ⏭️  ${skipped} skipped`);
  
  return {
    disk: fileName,
    exportDate: new Date().toISOString(),
    backend: 'Comprehensive Glossary',
    vocabulary: Object.keys(COMPREHENSIVE_GLOSSARY).length,
    strings: result,
    stats: { total, translated, skipped }
  };
}

async function main() {
  console.log('🎮 COMPREHENSIVE GLOSSARY TRANSLATION');
  console.log('====================================');
  console.log(`📚 Vocabulary: ${Object.keys(COMPREHENSIVE_GLOSSARY).length} terms\n`);
  
  const EXTRACTION_DIR = path.join(__dirname, 'alshark-extraction-test');
  const OUTPUT_DIR = path.join(__dirname, 'OUT-GLOSSARY');
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  const extractionFiles = fs.readdirSync(EXTRACTION_DIR)
    .filter(f => f.endsWith('.extraction.json'))
    .map(f => path.join(EXTRACTION_DIR, f));
  
  console.log(`📚 Found ${extractionFiles.length} disk files\n`);
  
  const results = [];
  let totalStrings = 0;
  let totalTranslated = 0;
  
  for (const file of extractionFiles) {
    const result = await processFile(file);
    if (result) {
      results.push(result);
      totalStrings += result.stats.total;
      totalTranslated += result.stats.translated;
      
      const outputPath = path.join(OUTPUT_DIR, `${result.disk}.translated.json`);
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`  💾 Saved: ${path.basename(outputPath)}`);
    }
  }
  
  // Master file
  const master = {
    exportDate: new Date().toISOString(),
    backend: 'Comprehensive Glossary',
    vocabulary: Object.keys(COMPREHENSIVE_GLOSSARY).length,
    disks: results
  };
  
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'alshark-master-glossary.json'),
    JSON.stringify(master, null, 2)
  );
  
  // Summary
  const coverage = ((totalTranslated/totalStrings)*100).toFixed(1);
  const summary = `
🎊 TRANSLATION COMPLETE
=======================

Method: Comprehensive Glossary
Vocabulary: ${Object.keys(COMPREHENSIVE_GLOSSARY).length} Japanese terms
Backend: Free (Instant)

📊 Results:
- Total strings: ${totalStrings}
- Translated: ${totalTranslated}
- Coverage: ${coverage}%
- Cost: $0.00

📁 Output: OUT-GLOSSARY/

${coverage < 50 ? `
⚠️  Glossary coverage is ${coverage}%. 
For full translation, recommend:
1. Ollama (free, unlimited): node translate-free-ollama.js
2. Google Translate (free tier): Use GoogleTranslateFreeBackend
3. DeepL (free tier): Use DeepLFreeBackend
` : '✅ Good coverage! Review translations in OUT-GLOSSARY/'}
`;
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'SUMMARY.txt'), summary);
  console.log(summary);
}

main().catch(console.error);
