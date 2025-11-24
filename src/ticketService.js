import { db } from './db.js';

function nowIso() {
  return new Date().toISOString();
}

function formatTicketNumber(id) {
  return `TICKET-${id.toString().padStart(3, '0')}`;
}

export function createTicket({ user, description, category, files }) {
  return new Promise((resolve, reject) => {
    const createdAt = nowIso();
    const status = 'Open';

    db.run(
      `
      INSERT INTO tickets (user_id, username, first_name, last_name, category, description, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        user.id,
        user.username || null,
        user.first_name || null,
        user.last_name || null,
        category || null,
        description,
        status,
        createdAt,
        createdAt
      ],
      function (err) {
        if (err) return reject(err);

        const ticketId = this.lastID;
        const ticketNumber = formatTicketNumber(ticketId);

        db.run(
          `UPDATE tickets SET ticket_number = ? WHERE id = ?`,
          [ticketNumber, ticketId],
          (err2) => {
            if (err2) return reject(err2);

            // збереження файлів
            if (files && files.length) {
              const stmt = db.prepare(
                `INSERT INTO ticket_files (ticket_id, file_id, file_type, created_at)
                 VALUES (?, ?, ?, ?)`
              );
              const createdAtFile = nowIso();
              files.forEach((f) => {
                stmt.run(ticketId, f.file_id, f.file_type, createdAtFile);
              });
              stmt.finalize();
            }

            resolve({
              id: ticketId,
              ticketNumber,
              status,
              description,
              category,
              user
            });
          }
        );
      }
    );
  });
}

export function updateTicketStatus(ticketId, newStatus, changedBy) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM tickets WHERE id = ?`,
      [ticketId],
      (err, ticket) => {
        if (err) return reject(err);
        if (!ticket) return reject(new Error('Ticket not found'));

        const oldStatus = ticket.status;
        const updatedAt = nowIso();

        db.run(
          `UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`,
          [newStatus, updatedAt, ticketId],
          (err2) => {
            if (err2) return reject(err2);

            db.run(
              `
              INSERT INTO status_history (ticket_id, old_status, new_status, changed_by, changed_at)
              VALUES (?, ?, ?, ?, ?)
            `,
              [ticketId, oldStatus, newStatus, changedBy || null, updatedAt],
              (err3) => {
                if (err3) return reject(err3);

                resolve({ ...ticket, status: newStatus });
              }
            );
          }
        );
      }
    );
  });
}

export function setSupportMessageId(ticketId, messageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE tickets SET support_chat_message_id = ? WHERE id = ?`,
      [messageId, ticketId],
      (err) => {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

export function getTicketById(ticketId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM tickets WHERE id = ?`,
      [ticketId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

export function listTicketsByUserAndStatus(userId, status) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM tickets WHERE user_id = ? AND status = ? ORDER BY created_at DESC`,
      [userId, status],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

export function listTicketsByUser(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      }
    );
  });
}

