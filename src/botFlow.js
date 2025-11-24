import { Telegraf, session } from 'telegraf';
import { BOT_TOKEN, SUPPORT_CHAT_ID } from './config.js';
import { mainMenuKeyboard, categoryKeyboard, ticketStatusKeyboard } from './keyboards.js';
import { createTicket, updateTicketStatus, setSupportMessageId, getTicketById } from './ticketService.js';

export const bot = new Telegraf(BOT_TOKEN);

// додаємо сесію в контекст
bot.use(session());

// початковий стан сесії
function resetSession(ctx) {
  ctx.session = {
    mode: null,
    step: null,
    ticketDraft: null
  };
}

bot.start(async (ctx) => {
  resetSession(ctx);
  await ctx.reply(
    '👋 Вітаємо в технічній підтримці!\nЩоб створити запит, натисніть кнопку нижче.',
    mainMenuKeyboard
  );
});
bot.command('chatid', async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}`);
  console.log("CHAT ID:", ctx.chat.id);
});


// натиснута кнопка "Створити тікет"
bot.action('CREATE_TICKET', async (ctx) => {
  resetSession(ctx);
  ctx.session.mode = 'create_ticket';
  ctx.session.step = 'description';
  ctx.session.ticketDraft = {
    description: '',
    category: null,
    files: []
  };

  await ctx.answerCbQuery();
  await ctx.reply('📝 Опишіть, будь ласка, вашу проблему максимально детально.');
});

// обробка тексту під час створення тікета
bot.on('text', async (ctx, next) => {
  const { mode, step, ticketDraft } = ctx.session || {};
  if (mode === 'create_ticket') {
    if (step === 'description') {
      ticketDraft.description = ctx.message.text.trim();
      if (!ticketDraft.description) {
        return ctx.reply('Будь ласка, введіть опис проблеми (це обовʼязково).');
      }

      ctx.session.step = 'category';
      return ctx.reply(
        '🏷️ Оберіть категорію або натисніть "Пропустити":',
        categoryKeyboard
      );
    }

    // якщо ми вже далі по флоу — просто ігноруємо текст
    return;
  }

  return next();
});

// вибір категорії
bot.action(/CATEGORY_.+/, async (ctx) => {
  const { mode, ticketDraft } = ctx.session || {};
  if (mode !== 'create_ticket') {
    return ctx.answerCbQuery();
  }

  const action = ctx.callbackQuery.data;
  let category = null;

  if (action === 'CATEGORY_IT') category = 'IT';
  if (action === 'CATEGORY_ACCESS') category = 'Доступи';
  if (action === 'CATEGORY_HARDWARE') category = 'Техніка';
  if (action === 'CATEGORY_ACCOUNTING') category = 'Бухгалтерія';
  if (action === 'CATEGORY_SKIP') category = null;

  ticketDraft.category = category;
  ctx.session.step = 'file';

  await ctx.answerCbQuery();
  await ctx.reply(
    '📎 Надішліть, будь ласка, хоча б один файл або скріншот, який ілюструє проблему.'
  );
});

// прийом файлу/фото
bot.on(['photo', 'document'], async (ctx, next) => {
  const { mode, step, ticketDraft } = ctx.session || {};
  if (mode !== 'create_ticket' || step !== 'file') {
    return next();
  }

  let fileId;
  let fileType;

  if (ctx.message.photo) {
    const photoSizes = ctx.message.photo;
    const largest = photoSizes[photoSizes.length - 1];
    fileId = largest.file_id;
    fileType = 'photo';
  } else if (ctx.message.document) {
    fileId = ctx.message.document.file_id;
    fileType = 'document';
  }

  if (!fileId) {
    return ctx.reply('Не вдалося прочитати файл, спробуйте ще раз.');
  }

  // Для MVP — використовуємо перший файл і одразу створюємо тікет
  ticketDraft.files.push({ file_id: fileId, file_type: fileType });

  try {
    const ticket = await createTicket({
      user: ctx.from,
      description: ticketDraft.description,
      category: ticketDraft.category,
      files: ticketDraft.files
    });

    // Відправляємо в канал IT
    let categoryText = ticket.category ? ticket.category : '—';
    const text =
      `🆕 НОВИЙ ТІКЕТ #${ticket.ticketNumber}\n` +
      `👤 Користувач: @${ctx.from.username || 'без username'}\n` +
      `🏷️ Категорія: ${categoryText}\n` +
      `📝 Опис: ${ticket.description}\n` +
      `📎 Вкладень: ${ticketDraft.files.length} файл(и)\n` +
      `Статус: 🟡 Open`;

    const supportMessage = await ctx.telegram.sendMessage(
      SUPPORT_CHAT_ID,
      text,
      ticketStatusKeyboard(ticket.id)
    );

    // пересилаємо файл(и) в канал
    for (const f of ticketDraft.files) {
      if (f.file_type === 'photo') {
        await ctx.telegram.sendPhoto(SUPPORT_CHAT_ID, f.file_id, {
          caption: `📎 Вкладення до тікета #${ticket.ticketNumber}`
        });
      } else {
        await ctx.telegram.sendDocument(SUPPORT_CHAT_ID, f.file_id, {
          caption: `📎 Вкладення до тікета #${ticket.ticketNumber}`
        });
      }
    }

    await setSupportMessageId(ticket.id, supportMessage.message_id);

    await ctx.reply(
      `✅ Ваш тікет #${ticket.ticketNumber} прийнято. Фахівець відповість найближчим часом.`
    );

    resetSession(ctx);
  } catch (err) {
    console.error('Error creating ticket:', err);
    await ctx.reply('Сталася помилка при створенні тікета. Спробуйте, будь ласка, пізніше.');
    resetSession(ctx);
  }
});

// оновлення статусу з каналу IT
bot.action(/STATUS_(\d+)_(IN_PROGRESS|DONE)/, async (ctx) => {
  const match = ctx.callbackQuery.data.match(/STATUS_(\d+)_(IN_PROGRESS|DONE)/);
  if (!match) return ctx.answerCbQuery();

  const ticketId = parseInt(match[1], 10);
  const statusKey = match[2]; // IN_PROGRESS або DONE

  let newStatus;
  let statusEmoji;
  let userMessage;

  if (statusKey === 'IN_PROGRESS') {
    newStatus = 'In Progress';
    statusEmoji = '🔵';
    userMessage = (num) => `🔵 Ваш тікет #${num} взято в роботу.`;
  } else {
    newStatus = 'Done';
    statusEmoji = '🟢';
    userMessage = (num) => `🟢 Ваш тікет #${num} закрито.`;
  }

  try {
    const updatedTicket = await updateTicketStatus(
      ticketId,
      newStatus,
      ctx.from.id
    );

    if (!updatedTicket) {
      await ctx.answerCbQuery('Тікет не знайдено');
      return;
    }

    const ticketNumber = updatedTicket.ticket_number;

    // оновлюємо текст у службовому каналі
    const originalText =
      `🆕 НОВИЙ ТІКЕТ #${ticketNumber}\n` +
      `👤 Користувач: @${updatedTicket.username || 'без username'}\n` +
      `🏷️ Категорія: ${updatedTicket.category || '—'}\n` +
      `📝 Опис: ${updatedTicket.description}\n` +
      `📎 Вкладень: (див. нижче в чаті)\n` +
      `Статус: ${statusEmoji} ${newStatus}`;

    if (updatedTicket.support_chat_message_id) {
      await ctx.telegram.editMessageText(
        SUPPORT_CHAT_ID,
        updatedTicket.support_chat_message_id,
        null,
        originalText,
        ticketStatusKeyboard(ticketId)
      );
    }

    // повідомлення користувачу
    await ctx.telegram.sendMessage(
      updatedTicket.user_id,
      userMessage(ticketNumber)
    );

    await ctx.answerCbQuery('Статус оновлено');
  } catch (err) {
    console.error('Error updating status:', err);
    await ctx.answerCbQuery('Помилка при оновленні статусу');
  }
});
