import 'dotenv/config';

export const BOT_TOKEN = process.env.BOT_TOKEN;
export const SUPPORT_CHAT_ID = process.env.SUPPORT_CHAT_ID;
export const DATABASE_FILE = process.env.DATABASE_FILE || './helpdesk.db';

// Default main menu layout: array of rows, each row is array of { text, callback }
// You can edit these icons/labels to whatever you prefer.
export const MAIN_MENU_LAYOUT = [
  [{ text: '➕', cb: 'NEW_POST' }, { text: '🤝', cb: 'NEW_DEAL' }],
  [{ text: '📄', cb: 'MY_POSTS' }, { text: '👥', cb: 'MY_CHATS' }],
  [{ text: '⚠️', cb: 'SCAM_LIST' }, { text: '❌', cb: 'MENU_CLOSE' }]
];

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is not set in .env');
  process.exit(1);
}
if (!SUPPORT_CHAT_ID) {
  console.error('SUPPORT_CHAT_ID is not set in .env');
  process.exit(1);
}
