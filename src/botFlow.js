import { Telegraf, session } from 'telegraf';
import { BOT_TOKEN, SUPPORT_CHAT_ID } from './config.js';
import { mainMenuKeyboard, categoryKeyboard, ticketStatusKeyboard, fileKeyboard, ticketsFilterKeyboard, ticketChangeKeyboard } from './keyboards.js';
import { createTicket, updateTicketStatus, setSupportMessageId, getTicketById, listTicketsByUserAndStatus, listTicketsByUser } from './ticketService.js';

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

// Показати меню фільтрів для перегляду своїх тікетів
bot.action('VIEW_TICKETS_MENU', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Оберіть список тікетів для перегляду:', ticketsFilterKeyboard);
});

// helper to format tickets list
function formatTicketsList(tickets) {
  if (!tickets || tickets.length === 0) return 'Тікетів не знайдено.';

  return tickets
    .map((t) => {
      const num = t.ticket_number || `#${t.id}`;
      const desc = (t.description || '').replace(/\n/g, ' ');
      const short = desc.length > 80 ? desc.slice(0, 77) + '...' : desc;
      // owner display: prefer username, then first+last name, fallback to user_id
      let ownerText = 'без даних';
      if (t.username) ownerText = `@${t.username}`;
      else if (t.first_name || t.last_name) ownerText = `${(t.first_name || '').trim()} ${(t.last_name || '').trim()}`.trim();
      else if (t.user_id) ownerText = `id:${t.user_id}`;

      return `${num} — ${t.status} — ${short} — Власник: ${ownerText} (id:${t.user_id || t.userId || t.user_id})`;
    })
    .join('\n');
}


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
    '📎 Надішліть, будь ласка, хоча б один файл або скріншот, який ілюструє проблему, або натисніть Пропустити.',
    fileKeyboard
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
      `👤 Користувач: @${ctx.from.username || 'без username'} (id: ${ctx.from.id})\n` +
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
// end file handling

// Якщо користувач пропускає додавання файлу

bot.action('FILE_SKIP', async (ctx) => {
  const { mode, ticketDraft } = ctx.session || {};
  if (mode !== 'create_ticket') {
    return ctx.answerCbQuery();
  }

  await ctx.answerCbQuery();

  try {
    const ticket = await createTicket({
      user: ctx.from,
      description: ticketDraft.description,
      category: ticketDraft.category,
      files: ticketDraft.files // should be empty
    });

    // Відправляємо в канал IT
    let categoryText = ticket.category ? ticket.category : '—';
    const text =
      `🆕 НОВИЙ ТІКЕТ #${ticket.ticketNumber}\n` +
      `👤 Користувач: @${ctx.from.username || 'без username'} (id: ${ctx.from.id})\n` +
      `🏷️ Категорія: ${categoryText}\n` +
      `📝 Опис: ${ticket.description}\n` +
      `📎 Вкладень: ${ticketDraft.files.length} файл(и)\n` +
      `Статус: 🟡 Open`;

    const supportMessage = await ctx.telegram.sendMessage(
      SUPPORT_CHAT_ID,
      text,
      ticketStatusKeyboard(ticket.id)
    );

    await setSupportMessageId(ticket.id, supportMessage.message_id);

    await ctx.reply(`✅ Ваш тікет #${ticket.ticketNumber} прийнято. Фахівець відповість найближчим часом.`);

    resetSession(ctx);
  } catch (err) {
    console.error('Error creating ticket (skip files):', err);
    await ctx.reply('Сталася помилка при створенні тікета. Спробуйте, будь ласка, пізніше.');
    resetSession(ctx);
  }
});

// Обробники перегляду тікетів — власні тікети користувача
bot.action('VIEW_OPEN', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const tickets = await listTicketsByUserAndStatus(ctx.from.id, 'Open');
    if (!tickets || tickets.length === 0) return ctx.reply(formatTicketsList(tickets));

    for (const t of tickets) {
      const num = t.ticket_number || `#${t.id}`;
      const desc = (t.description || '').replace(/\n/g, ' ');
      const short = desc.length > 200 ? desc.slice(0, 197) + '...' : desc;
      // owner display
      let ownerText = 'без даних';
      if (t.username) ownerText = `@${t.username}`;
      else if (t.first_name || t.last_name) ownerText = `${(t.first_name || '').trim()} ${(t.last_name || '').trim()}`.trim();
      else if (t.user_id) ownerText = `id:${t.user_id}`;

      const text = `${num} — ${t.status}\n${short}\nВласник: ${ownerText} (id:${t.user_id || t.userId || t.user_id})`;
      await ctx.reply(text, ticketChangeKeyboard(t.id));
    }
  } catch (err) {
    console.error('Error listing open tickets:', err);
    await ctx.reply('Помилка при отриманні тікетів. Спробуйте пізніше.');
  }
});

bot.action('VIEW_IN_PROGRESS', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const tickets = await listTicketsByUserAndStatus(ctx.from.id, 'In Progress');
    if (!tickets || tickets.length === 0) return ctx.reply(formatTicketsList(tickets));

    for (const t of tickets) {
      const num = t.ticket_number || `#${t.id}`;
      const desc = (t.description || '').replace(/\n/g, ' ');
      const short = desc.length > 200 ? desc.slice(0, 197) + '...' : desc;
      // owner display
      let ownerText = 'без даних';
      if (t.username) ownerText = `@${t.username}`;
      else if (t.first_name || t.last_name) ownerText = `${(t.first_name || '').trim()} ${(t.last_name || '').trim()}`.trim();
      else if (t.user_id) ownerText = `id:${t.user_id}`;

      const text = `${num} — ${t.status}\n${short}\nВласник: ${ownerText} (id:${t.user_id || t.userId || t.user_id})`;
      await ctx.reply(text, ticketChangeKeyboard(t.id));
    }
  } catch (err) {
    console.error('Error listing in-progress tickets:', err);
    await ctx.reply('Помилка при отриманні тікетів. Спробуйте пізніше.');
  }
});

bot.action('VIEW_DONE', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const tickets = await listTicketsByUserAndStatus(ctx.from.id, 'Done');
    if (!tickets || tickets.length === 0) return ctx.reply(formatTicketsList(tickets));

    // helper to escape for HTML
    const escapeHtml = (s) => {
      if (!s && s !== 0) return '';
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    const items = tickets.map((t) => {
      const num = escapeHtml(t.ticket_number || `#${t.id}`);
      const status = escapeHtml(t.status || '');
      const desc = escapeHtml((t.description || '').split('\n')[0]);
      let ownerText = 'без даних';
      if (t.username) ownerText = `@${escapeHtml(t.username)}`;
      else if (t.first_name || t.last_name) ownerText = escapeHtml(((t.first_name || '') + ' ' + (t.last_name || '')).trim());
      else if (t.user_id) ownerText = `id:${escapeHtml(t.user_id)}`;

      const ownerId = escapeHtml(t.user_id || t.userId || '');

      return `<b>${num}</b> — <i>${status}</i>\n` +
        `${desc ? `<code>${desc}</code>\n` : ''}` +
        `<small>Власник: ${ownerText} (id:${ownerId})</small>`;
    });

    const message = items.join('\n\n────────────────\n\n');

    await ctx.replyWithHTML(message);
  } catch (err) {
    console.error('Error listing done tickets:', err);
    await ctx.reply('Помилка при отриманні тікетів. Спробуйте пізніше.');
  }
});

// Handlers to change status from user's list (allows owner or support chat)
bot.action(/SETSTATUS_(\d+)_(OPEN|IN_PROGRESS|DONE)/, async (ctx) => {
  const match = ctx.callbackQuery.data.match(/SETSTATUS_(\d+)_(OPEN|IN_PROGRESS|DONE)/);
  if (!match) return ctx.answerCbQuery();

  const ticketId = parseInt(match[1], 10);
  const statusKey = match[2];

  let newStatus;
  if (statusKey === 'OPEN') newStatus = 'Open';
  else if (statusKey === 'IN_PROGRESS') newStatus = 'In Progress';
  else newStatus = 'Done';

  try {
    const ticket = await getTicketById(ticketId);
    if (!ticket) return ctx.answerCbQuery('Тікет не знайдено');

    // allow if requester is ticket owner or the action is performed from support chat
    if (ctx.from.id !== ticket.user_id && !(ctx.chat && ctx.chat.id === parseInt(process.env.SUPPORT_CHAT_ID || '0', 10))) {
      // also allow if user's id equals SUPPORT_CHAT_ID? safer: allow only owner or support chat
      // if denied
      return ctx.answerCbQuery('Немає дозволу змінювати статус');
    }

    const updatedTicket = await updateTicketStatus(ticketId, newStatus, ctx.from.id);

    // update support chat message if exists
    if (updatedTicket.support_chat_message_id) {
      const ticketNumber = updatedTicket.ticket_number || `#${updatedTicket.id}`;
      const takerText = `@${ctx.from.username || 'без username'} (id: ${ctx.from.id})`;
      const statusEmoji = newStatus === 'In Progress' ? '🔵' : newStatus === 'Done' ? '🟢' : '🟡';
      const baseText =
        `🆕 НОВИЙ ТІКЕТ #${ticketNumber}\n` +
        `👤 Користувач: @${updatedTicket.username || 'без username'} (id: ${updatedTicket.user_id})\n` +
        `🏷️ Категорія: ${updatedTicket.category || '—'}\n` +
        `📝 Опис: ${updatedTicket.description}\n` +
        `📎 Вкладень: (див. нижче в чаті)\n` +
        `Статус: ${statusEmoji} ${newStatus}`;

      const takerLine = newStatus === 'In Progress' ? `\n🛠️ Взяв: ${takerText}` : newStatus === 'Done' ? `\n✅ Закрив: ${takerText}` : '';

      await ctx.telegram.editMessageText(
        SUPPORT_CHAT_ID,
        updatedTicket.support_chat_message_id,
        null,
        baseText + takerLine,
        ticketStatusKeyboard(ticketId)
      );
    }

    // notify ticket owner
    await ctx.telegram.sendMessage(updatedTicket.user_id, `Статус вашого тікета #${updatedTicket.ticket_number || updatedTicket.id} змінено на ${newStatus}. Виконавець: @${ctx.from.username || 'без username'} (id: ${ctx.from.id})`);

    await ctx.answerCbQuery('Статус оновлено');
  } catch (err) {
    console.error('Error setting status from list:', err);
    await ctx.answerCbQuery('Помилка при зміні статусу');
  }
});

// Forward original support-chat message into user's chat
bot.action(/VIEW_ORIGINAL_(\d+)/, async (ctx) => {
  const match = ctx.callbackQuery.data.match(/VIEW_ORIGINAL_(\d+)/);
  if (!match) return ctx.answerCbQuery();

  const ticketId = parseInt(match[1], 10);

  try {
    const ticket = await getTicketById(ticketId);
    if (!ticket) return ctx.answerCbQuery('Тікет не знайдено');

    if (!ticket.support_chat_message_id) {
      await ctx.answerCbQuery('Оригінал не знайдено в каналі');
      return;
    }

    // forward the support message into the current chat
    await ctx.telegram.forwardMessage(ctx.chat.id, SUPPORT_CHAT_ID, ticket.support_chat_message_id);
    await ctx.answerCbQuery();
  } catch (err) {
    console.error('Error forwarding original message:', err);
    await ctx.answerCbQuery('Не вдалося переглянути оригінал');
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
    userMessage = (num, takerText) => `🔵 Ваш тікет #${num} взято в роботу.\nВиконавець: ${takerText}`;
  } else {
    newStatus = 'Done';
    statusEmoji = '🟢';
    userMessage = (num, takerText) => `🟢 Ваш тікет #${num} закрито.\nЗакрив: ${takerText}`;
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

    // prepare taker text
    const takerText = `@${ctx.from.username || 'без username'} (id: ${ctx.from.id})`;

    // оновлюємо текст у службовому каналі
    const baseText =
      `🆕 НОВИЙ ТІКЕТ #${ticketNumber}\n` +
      `👤 Користувач: @${updatedTicket.username || 'без username'} (id: ${updatedTicket.user_id})\n` +
      `🏷️ Категорія: ${updatedTicket.category || '—'}\n` +
      `📝 Опис: ${updatedTicket.description}\n` +
      `📎 Вкладень: (див. нижче в чаті)\n` +
      `Статус: ${statusEmoji} ${newStatus}`;

    const takerLine = statusKey === 'IN_PROGRESS'
      ? `\n🛠️ Взяв: ${takerText}`
      : `\n✅ Закрив: ${takerText}`;

    const originalText = baseText + takerLine;

    if (updatedTicket.support_chat_message_id) {
      await ctx.telegram.editMessageText(
        SUPPORT_CHAT_ID,
        updatedTicket.support_chat_message_id,
        null,
        originalText,
        ticketStatusKeyboard(ticketId)
      );
    }

    // повідомлення користувачу (включає, хто взяв/закрив)
    await ctx.telegram.sendMessage(
      updatedTicket.user_id,
      userMessage(ticketNumber, takerText)
    );

    await ctx.answerCbQuery('Статус оновлено');
  } catch (err) {
    console.error('Error updating status:', err);
    await ctx.answerCbQuery('Помилка при оновленні статусу');
  }
});
