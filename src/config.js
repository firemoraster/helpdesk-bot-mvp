import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const SUPPORT_CHAT_ID = process.env.SUPPORT_CHAT_ID;
export const DATABASE_FILE = process.env.DATABASE_FILE || './helpdesk.db';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!SUPPORT_CHAT_ID) {
  console.error('SUPPORT_CHAT_ID is not set in .env');
  process.exit(1);
}
