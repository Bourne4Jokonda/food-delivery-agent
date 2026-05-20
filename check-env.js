// check-env.js
require('dotenv').config();
console.log('🔑 CLIENT_SECRET length:', process.env.GIGACHAT_CLIENT_SECRET?.length);
console.log('🔑 Первые 20 символов:', process.env.GIGACHAT_CLIENT_SECRET?.slice(0, 20));