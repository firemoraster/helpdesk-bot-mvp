import { Telegraf, session } from 'telegraf';
import { BOT_TOKEN, SUPPORT_CHAT_ID } from './config.js';
import { mainMenuKeyboard, categoryKeyboard, ticketStatusKeyboard, fileKeyboard, ticketsMenuKeyboard, ticketChangeKeyboard, adminMenuKeyboard, adminStartKeyboard, ADMIN_IDS } from './keyboards.js';
import { createTicket, updateTicketStatus, setSupportMessageId, getTicketById, listTicketsByUserAndStatus, listTicketsByUser, listTicketsByUsername } from './ticketService.js';
import { getDb } from './db.js';

export const bot = new Telegraf(BOT_TOKEN);

// додаємо сесію в контекст
bot.use(session());

// початковий стан сесії
function resetSession(ctx) {
  ctx.session = {
    mode: null,
    step: null,
    ticketDraft: null,
    adminSearching: false // додаємо це поле
  };
}

bot.start(async (ctx) => {
  resetSession(ctx);
  const isAdmin = ADMIN_IDS.includes(ctx.from.id);
  const keyboard = isAdmin ? adminStartKeyboard : mainMenuKeyboard;
  const message = isAdmin 
    ? '👋 Вітаємо, адміністратор!\nОберіть дію:'
    : '👋 Вітаємо в технічній підтримці!\nЩоб створити запит, натисніть кнопку нижче.';
  await ctx.reply(message, keyboard);
});

bot.command('chatid', async (ctx) => {
  await ctx.reply(`Chat ID: ${ctx.chat.id}`);
  console.log("CHAT ID:", ctx.chat.id);
});

// Admin panel
bot.action('ADMIN_PANEL', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Немає доступу');
  }
  await ctx.reply('📊 Адмін-панель:', adminMenuKeyboard);
});

// Admin command
bot.command('admin', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Немає доступу');
  }
  await ctx.reply('📊 Адмін-панель:', adminMenuKeyboard);
});

// Show menu to view own tickets
bot.action('VIEW_TICKETS_MENU', async (ctx) => {
  await ctx.answerCbQuery();
  return ctx.reply('Оберіть список своїх тікетів:', ticketsMenuKeyboard);
});

// натиснута кнопка "Створити тікет"
bot.action('CREATE_TICKET', async (ctx) => {
  // reset and prepare session for ticket creation
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

// Admin: search tickets by user
bot.action('ADMIN_USER_SEARCH', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Немає доступу');
  }

  // Initialize session with proper structure
  if (!ctx.session) {
    ctx.session = {
      mode: null,
      step: null,
      ticketDraft: null,
      adminSearching: false
    };
  }

  // Set admin searching mode
  ctx.session.adminSearching = true;
  
  console.log('Admin search initiated, adminSearching set to:', ctx.session.adminSearching);
  
  await ctx.reply('🔍 Введіть нік, ім\'я або ID користувача:');
});

// Handle search input for admin search - MUST BE BEFORE generic text handler
bot.on('text', async (ctx, next) => {
  // Only handle messages in private chats (direct messages to bot)
  if (ctx.chat.type !== 'private') {
    return next();
  }

  // Initialize session if it doesn't exist
  if (!ctx.session) {
    ctx.session = {
      mode: null,
      step: null,
      ticketDraft: null,
      adminSearching: false
    };
  }

  console.log('Text message received, adminSearching:', ctx.session.adminSearching, 'isAdmin:', ADMIN_IDS.includes(ctx.from.id));

  // Handle admin search first, before anything else
  if (ctx.session.adminSearching && ADMIN_IDS.includes(ctx.from.id)) {
    console.log('Processing admin search for query:', ctx.message.text);
    let searchQuery = ctx.message.text.trim();
    
    // Remove @ symbol if present
    if (searchQuery.startsWith('@')) {
      searchQuery = searchQuery.substring(1);
    }
    
    try {
      let tickets = [];
      let searchType = '';

      // Try to parse as ID first
      const userId = parseInt(searchQuery, 10);
      if (!isNaN(userId) && userId > 0) {
        console.log('Searching by user ID:', userId);
        tickets = await listTicketsByUser(userId);
        searchType = `ID ${userId}`;
      } else {
        // Search by username, first_name, or last_name
        console.log('Searching by username/name:', searchQuery);
        tickets = await listTicketsByUsername(searchQuery);
        console.log('Search returned', tickets?.length || 0, 'tickets');
        searchType = `"${searchQuery}"`;
      }

      // Reset searching state
      ctx.session.adminSearching = false;

      if (!tickets || tickets.length === 0) {
        console.log('No tickets found for search');
        return ctx.reply(`📭 Тікетів для користувача ${searchType} не знайдено.`);
      }

      console.log('Found', tickets.length, 'tickets, formatting response...');

      let message = `📋 <b>Тікети користувача ${searchType}:</b>\n\n`;
      for (const ticket of tickets) {
        const owner = ticket.username ? `@${ticket.username}` : ((ticket.first_name || '') + ' ' + (ticket.last_name || '')).trim() || `ID: ${ticket.user_id}`;
        const statusEmoji = ticket.status === 'OPEN' ? '🔴' : ticket.status === 'IN_PROGRESS' ? '🟡' : '🟢';
        message += `${statusEmoji} <b>#${ticket.ticket_number}</b> - ${ticket.category || 'без категорії'}\n`;
        message += `  Автор: ${owner}\n`;
        message += `  ${ticket.description.substring(0, 50)}${ticket.description.length > 50 ? '...' : ''}\n\n`;
      }

      console.log('Sending search results...');
      return ctx.reply(message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error('Error searching tickets:', err.message, err.stack);
      ctx.session.adminSearching = false;
      return ctx.reply('❌ Помилка при пошуку тікетів: ' + err.message);
    }
  }

  return next();
});

// обробка тексту під час створення тікета - NOW THIS IS SECOND
bot.on('text', async (ctx, next) => {
  const { mode, step, ticketDraft } = ctx.session || {};
  
  // Skip if admin is searching for users
  if (ctx.session && ctx.session.adminSearching) {
    return next();
  }
  
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

// View active tickets (Open + In Progress combined)
bot.action('VIEW_ACTIVE', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const openTickets = await listTicketsByUserAndStatus(ctx.from.id, 'Open');
    const inProgressTickets = await listTicketsByUserAndStatus(ctx.from.id, 'In Progress');
    const allActive = [...openTickets, ...inProgressTickets].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!allActive || allActive.length === 0) return ctx.reply('Активних тікетів не знайдено.');

    for (const t of allActive) {
      const num = t.ticket_number || `#${t.id}`;
      const desc = (t.description || '').replace(/\n/g, ' ');
      const short = desc.length > 200 ? desc.slice(0, 197) + '...' : desc;
      let ownerText = 'без даних';
      if (t.username) ownerText = `@${t.username}`;
      else if (t.first_name || t.last_name) ownerText = `${(t.first_name || '').trim()} ${(t.last_name || '').trim()}`.trim();
      else if (t.user_id) ownerText = `id:${t.user_id}`;

      const text = `${num} — ${t.status}\n${short}\nВласник: ${ownerText} (id:${t.user_id || t.userId || t.user_id})`;
      await ctx.reply(text, ticketChangeKeyboard(t.id));
    }
  } catch (err) {
    console.error('Error listing active tickets:', err);
    await ctx.reply('Помилка при отриманні тікетів. Спробуйте пізніше.');
  }
});

// View closed tickets
bot.action('VIEW_CLOSED', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    const tickets = await listTicketsByUserAndStatus(ctx.from.id, 'Done');
    if (!tickets || tickets.length === 0) return ctx.reply('Закритих тікетів не знайдено.');

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

      return `<b>${num}</b> — <i>${status}</i>\n${desc ? `<code>${desc}</code>\n` : ''}Власник: ${ownerText} (id:${ownerId})`;
    });

    // Split into multiple messages if too long (Telegram limit: 4096 chars)
    let currentMessage = '<b>✔️ Закриті тікети:</b>\n\n';
    let messageCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const separator = i < items.length - 1 ? '\n────────────────\n' : '';
      const potentialMessage = currentMessage + item + separator;

      if (potentialMessage.length > 3800) {
        // Send current message and start new one
        if (currentMessage !== '<b>✔️ Закриті тікети:</b>\n\n') {
          await ctx.replyWithHTML(currentMessage);
          messageCount++;
        }
        currentMessage = item + separator;
      } else {
        currentMessage = potentialMessage;
      }
    }

    // Send the last message
    if (currentMessage !== '<b>✔️ Закриті тікети:</b>\n\n') {
      await ctx.replyWithHTML(currentMessage);
      messageCount++;
    }

    if (messageCount === 0) {
      await ctx.reply('Закритих тікетів не знайдено.');
    }
  } catch (err) {
    console.error('Error listing closed tickets:', err);
    await ctx.reply('Помилка при отриманні тікетів. Спробуйте пізніше.');
  }
});

// Admin: view user's tickets
bot.command('user_tickets', async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Немає доступу');
  }
  const userId = parseInt(ctx.message.text.split(' ')[1], 10);
  if (!userId) return ctx.reply('Використовуйте: /user_tickets <user_id>');
  
  try {
    const tickets = await listTicketsByUser(userId);
    if (!tickets || tickets.length === 0) return ctx.reply(`Тікетів для користувача ${userId} не знайдено.`);
    await ctx.reply(`Тікети користувача ${userId}: ${tickets.length} шт.`);
  } catch (err) {
    console.error('Error in user_tickets:', err);
    await ctx.reply('Помилка');
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
      try {
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
      } catch (editErr) {
        console.error('Error editing support message:', editErr.message);
        // Continue without failing - message may have been deleted
      }
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
    if (!ticket) {
      await ctx.answerCbQuery('Тікет не знайдено');
      return;
    }

    if (!ticket.support_chat_message_id) {
      await ctx.answerCbQuery('Оригінал не знайдено в каналі');
      return;
    }

    // forward the support message into the current chat
    try {
      const supportChatId = parseInt(SUPPORT_CHAT_ID, 10);
      await ctx.telegram.forwardMessage(ctx.chat.id, supportChatId, ticket.support_chat_message_id);
      await ctx.answerCbQuery();
    } catch (forwardErr) {
      console.error('Error forwarding message:', forwardErr.message);
      await ctx.answerCbQuery('Повідомлення було видалено або недоступне');
    }
  } catch (err) {
    console.error('Error viewing original message:', err);
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
      try {
        await ctx.telegram.editMessageText(
          SUPPORT_CHAT_ID,
          updatedTicket.support_chat_message_id,
          null,
          originalText,
          ticketStatusKeyboard(ticketId)
        );
      } catch (editErr) {
        console.error('Error editing support message:', editErr.message);
        // Continue without failing - message may have been deleted
      }
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

// Admin: view all tickets
bot.action('ADMIN_ALL_TICKETS', async (ctx) => {
  await ctx.answerCbQuery();
  
  if (!ADMIN_IDS.includes(ctx.from.id)) {
    return ctx.reply('Немає доступу');
  }

  try {
    const db = getDb();
    const tickets = db.prepare(`
      SELECT id, ticket_number, user_id, username, first_name, last_name, category, description, status, created_at
      FROM tickets
      ORDER BY created_at DESC
      LIMIT 50
    `).all();

    if (!tickets || tickets.length === 0) {
      return ctx.reply('Тікетів не знайдено.');
    }

    let message = '📋 <b>Всі тікети:</b>\n\n';
    for (const ticket of tickets) {
      const owner = ticket.username ? `@${ticket.username}` : (ticket.first_name || ticket.last_name || `ID: ${ticket.user_id}`);
      const statusEmoji = ticket.status === 'OPEN' ? '🔴' : ticket.status === 'IN_PROGRESS' ? '🟡' : '🟢';
      message += `${statusEmoji} <b>#${ticket.ticket_number}</b> - ${ticket.category}\n`;
      message += `  Автор: ${owner}\n`;
      message += `  ${ticket.description.substring(0, 50)}${ticket.description.length > 50 ? '...' : ''}\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (err) {
    console.error('Error fetching all tickets:', err);
    await ctx.answerCbQuery('Помилка при завантаженні тікетів');
  }
});