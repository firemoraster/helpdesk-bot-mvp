import { bot } from './botFlow.js';
import { initDb } from './db.js';

async function main() {
  initDb();

  bot.launch();
  console.log('🤖 Helpdesk bot is running...');
}

main();

// Коректне завершення
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
