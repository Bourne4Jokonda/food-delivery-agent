const Fuse = require("fuse.js");
const fs = require("fs");
const path = require("path");

const STOP_WORDS = new Set([
  "хочу", "мне", "дайте", "пожалуйста", "здравствуйте", "дай",
  "нужно", "нужна", "нужен", "покажи", "покажите", "есть",
  "что", "какая", "какие", "какой"
]);

// 🎯 Функция извлечения сущностей (адрес, оплата, товары)
function extractEntities(text) {
  const t = text.toLowerCase();
  const entities = { 
    items: [], 
    payment: null, 
    fulfillment: 'delivery', 
    address: null, 
    phone: null 
  };

  // Товары
  const itemMatch = t.match(/(\d*)\s*(пицц[ауы]?|суш[иа]?|напит[окки]?|лимонад[ы]?|маргарит[аы]?|диабло)/gi);
  if (itemMatch) {
    entities.items = itemMatch.map(i => ({ 
      name: i.replace(/\d/g, '').trim(), 
      qty: parseInt(i) || 1 
    }));
  }

  // Оплата
  if (/онлайн|предоплат|картой сейчас|по ссылк/.test(t)) {
    entities.payment = 'card_online';
  } else if (/наличн|налом|кеш/.test(t)) {
    entities.payment = 'cash';
  } else if (/при получени|сбп|перевод|безнал|картой курьер/.test(t)) {
    entities.payment = 'card_cash';
  }

  // Самовывоз
  if (/самовывоз|забер/.test(t)) {
    entities.fulfillment = 'pickup';
  }

  //  Адрес (гибкий парсинг)
  const addrPatterns = [
    /ул\.?\s+[\wа-яё\s\-]+(?:\s+д\.?\s*\d+[а-я]?)/i,
    /проспект\.?\s+[\wа-яё\s\-]+(?:\s+д\.?\s*\d+[а-я]?)/i,
    /[\wа-яё\s]+\s+д\.?\s*\d+[а-я]?/i,
    /^[а-яё\s]+\s+\d+[а-я]?$/i,           // "Гагарина 1"
    /мкр\s+[\wа-яё\s]+\s+\d+/i            // "мкр Гагарина 1"
  ];

  for (const pattern of addrPatterns) {
    const match = t.match(pattern);
    if (match) {
      entities.address = match[0].trim();
      break;
    }
  }

  // Фоллбэк: если есть слова + цифры
  if (!entities.address && /[\wа-яё]+\s+\d+/i.test(t)) {
    const simple = t.match(/[\wа-яё\s]+\s+\d+/i);
    if (simple && !STOP_WORDS.has(simple[0].split(' ')[0])) {
      entities.address = simple[0].trim();
    }
  }

  // Телефон
  const phone = t.match(/[\+]?[\d\s\-\(\)]{10,}/);
  if (phone) {
    entities.phone = phone[0].replace(/\D/g, '');
  }

  return entities;
}

// Загрузка базы знаний
function loadKnowledgeBase() {
  const kbDir = path.join(__dirname, '..', 'knowledge_base');
  const files = fs.readdirSync(kbDir).filter(f => f.endsWith('.md'));
  const docs = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(kbDir, file), 'utf-8');
    const blocks = content.split(/\n\n+/).filter(b => b.trim());
    
    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const tagsLine = lines[0] || '';
      const text = lines.slice(1).join(' ').trim();
      const tags = (tagsLine.match(/#[\wа-яё]+/g) || []).map(t => t.slice(1).toLowerCase());
      
      docs.push({ tags, content: text, source: file });
    }
  }

  return docs;
}

// Инициализация Fuse.js
const docs = loadKnowledgeBase();
const fuse = new Fuse(docs, {
  keys: ['tags', 'content'],
  threshold: 0.4,
  minMatchCharLength: 2,
  includeScore: true
});

// Поиск по базе
function searchChunks(query, topK = 3) {
  const cleaned = query.toLowerCase()
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w))
    .join(' ');

  if (!cleaned) return { matches: [], context: 'Ничего не найдено.' };

  const results = fuse.search(cleaned, { limit: topK });
  const matches = results.map(r => ({
    tags: r.item.tags,
    text: r.item.content,
    score: r.score
  }));

  const context = matches.map(m => `- ${m.text}`).join('\n');
  return { matches, context: context || 'Контекст не найден.' };
}

// ✅ ЭКСПОРТ (важно!)
module.exports = {
  extractEntities,
  searchChunks
};