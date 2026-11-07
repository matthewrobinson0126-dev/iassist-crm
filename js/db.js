// Picks where data lives: Supabase when configured, otherwise this device (demo mode).
import { CONFIG } from './config.js';
import { localDb } from './db-local.js';
import { supaDb, remote as supaRemote } from './db-supabase.js';

const cloud = !!(CONFIG.supabaseUrl && CONFIG.supabaseKey && window.supabase);
export const db = cloud ? supaDb : localDb;
export const remote = cloud ? supaRemote : null;
