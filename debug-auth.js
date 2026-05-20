// debug-auth.js
require('dotenv').config();

const CLIENT_ID = (process.env.GIGACHAT_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.GIGACHAT_CLIENT_SECRET || '').trim();

console.log('=== ОТЛАДКА AUTH ===');
console.log('1. CLIENT_ID:', CLIENT_ID);
console.log('2. CLIENT_SECRET (первые 30 симв.):', CLIENT_SECRET?.slice(0, 30) + '...');
console.log('3. CLIENT_SECRET длина:', CLIENT_SECRET?.length);
console.log('4. Строка для кодирования:', `${CLIENT_ID}:${CLIENT_SECRET?.slice(0, 10)}...`);

const combined = `${CLIENT_ID}:${CLIENT_SECRET}`;
const encoded = Buffer.from(combined).toString('base64');
console.log('5. Base64 (начало):', encoded.slice(0, 60) + '...');

// Попробуем декодировать обратно для проверки
const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
console.log('6. Декодировано обратно:', decoded.slice(0, 50) + '...');

// Проверка: если CLIENT_SECRET начинается как CLIENT_ID — это ошибка!
if (CLIENT_SECRET?.startsWith(CLIENT_ID.slice(0, 10))) {
  console.log('❌ ОШИБКА: CLIENT_SECRET содержит CLIENT_ID!');
  console.log('💡 Решение: в .env вставь ключ из поля "Authorization key", а не "Client ID"');
} else {
  console.log('✅ Формат выглядит верно');
}