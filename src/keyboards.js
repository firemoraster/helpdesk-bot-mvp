import { Markup } from 'telegraf';

export const mainMenuKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('🆕 Створити тікет', 'CREATE_TICKET')]
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

export function ticketStatusKeyboard(ticketId) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🔵 Взяти в роботу', `STATUS_${ticketId}_IN_PROGRESS`),
      Markup.button.callback('🟢 Закрити', `STATUS_${ticketId}_DONE`)
    ]
  ]);
}
