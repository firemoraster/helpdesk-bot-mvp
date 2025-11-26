import { Markup } from 'telegraf';

const ADMIN_IDS = [8469943654, 396862984];

export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🆕 Створити тікет', 'CREATE_TICKET')],
  [Markup.button.callback('📂 Мої тікети', 'VIEW_TICKETS_MENU')]
]);

export const ticketsMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('✅ Активні', 'VIEW_ACTIVE')],
  [Markup.button.callback('✔️ Закриті', 'VIEW_CLOSED')]
]);

export const categoryKeyboard = Markup.inlineKeyboard([
  [
    Markup.button.callback('IT', 'CATEGORY_IT'),
    Markup.button.callback('Доступи', 'CATEGORY_ACCESS')
  ],
  [
    Markup.button.callback('Техніка', 'CATEGORY_HARDWARE'),
    Markup.button.callback('Бухгалтерія', 'CATEGORY_ACCOUNTING')
  ],
  [Markup.button.callback('Пропустити', 'CATEGORY_SKIP')]
]);

export const fileKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Пропустити', 'FILE_SKIP')]
]);

export const adminMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('👥 Всі тікети', 'ADMIN_ALL_TICKETS')],
  [Markup.button.callback('🔍 Пошук по юзеру', 'ADMIN_USER_SEARCH')]
]);

export const adminStartKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('📊 Адмін-панель', 'ADMIN_PANEL')],
  [Markup.button.callback('🆕 Створити тікет', 'CREATE_TICKET')],
  [Markup.button.callback('📂 Мої тікети', 'VIEW_TICKETS_MENU')]
]);

// ReplyKeyboardMarkup - постійні кнопки внизу чату для звичайних користувачів
export const mainReplyKeyboard = Markup.keyboard([
  ['🆕 Створити тікет', '📂 Мої тікети'],
  ['❓ Довідка']
], { resize_keyboard: true, one_time_keyboard: false });

// ReplyKeyboardMarkup - постійні кнопки для адмінів
export const adminReplyKeyboard = Markup.keyboard([
  ['🆕 Створити тікет', '📂 Мої тікети'],
  ['📊 Адмін-панель', '❓ Довідка']
], { resize_keyboard: true, one_time_keyboard: false });

export { ADMIN_IDS };

export function ticketStatusKeyboard(ticketId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔵 Взяти в роботу', `STATUS_${ticketId}_IN_PROGRESS`),
      Markup.button.callback('🟢 Закрити', `STATUS_${ticketId}_DONE`)
    ]
  ]);
}

export function ticketChangeKeyboard(ticketId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('Відкрити', `SETSTATUS_${ticketId}_OPEN`),
      Markup.button.callback('Взяти в роботу', `SETSTATUS_${ticketId}_IN_PROGRESS`)
    ],
    [Markup.button.callback('Позначити як зроблене', `SETSTATUS_${ticketId}_DONE`)],
    [Markup.button.callback('Переглянути оригінал у каналі', `VIEW_ORIGINAL_${ticketId}`)]
  ]);
}
