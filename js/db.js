// Picks where data lives: Supabase when configured, otherwise this device (demo mode).
import { CONFIG } from './config.js?v=20261119233148';
import { localDb } from './db-local.js?v=20261119233148';
import { supaDb, remote as supaRemote } from './db-supabase.js?v=20261119233148';

const cloud = !!(CONFIG.supabaseUrl && CONFIG.supabaseKey && window.supabase);
export const db = cloud ? supaDb : localDb;
export const remote = cloud ? supaRemote : null;
