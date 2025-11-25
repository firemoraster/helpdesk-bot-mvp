import sqlite3 from 'sqlite3';
import Database from 'better-sqlite3';
import { DATABASE_FILE } from './config.js';

sqlite3.verbose();

export const db = new sqlite3.Database(DATABASE_FILE);

let syncDb = null;
export function getDb() {
  if (!syncDb) {
    syncDb = new Database(DATABASE_FILE);
  }
  return syncDb;
}

export function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT UNIQUE,
        user_id INTEGER NOT NULL,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        category TEXT,
        description TEXT NOT NULL,
        status TEXT NOT NULL,
        support_chat_message_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS ticket_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        file_id TEXT NOT NULL,
        file_type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_id INTEGER NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_by INTEGER,
        changed_at TEXT NOT NULL,
        FOREIGN KEY(ticket_id) REFERENCES tickets(id)
      )
    `);
  });
}
