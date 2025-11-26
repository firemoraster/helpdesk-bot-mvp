import { bot } from './botFlow.js';
import { initDb } from './db.js';

async function main() {
  initDb();

  // Встановлюємо команди в меню бота
  await bot.telegram.setMyCommands([
    { command: 'start', description: '🏠 Головне меню' },
    { command: 'admin', description: '📊 Адмін-панель' },
    { command: 'help', description: '❓ Довідка' }
  ]);

  bot.launch();
  console.log('🤖 Helpdesk bot is running...');
}

main();

// Коректне завершення
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
