import { Markup } from 'telegraf';

export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🆕 Створити тікет', 'CREATE_TICKET')],
  [Markup.button.callback('📂 Мої тікети', 'VIEW_TICKETS_MENU')]
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

export const ticketsFilterKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('Відкриті', 'VIEW_OPEN'), Markup.button.callback('Взяті в роботу', 'VIEW_IN_PROGRESS')],
  [Markup.button.callback('Зроблені', 'VIEW_DONE')]
]);

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
