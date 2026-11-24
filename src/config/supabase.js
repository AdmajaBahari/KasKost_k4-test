const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const url = process.env.SUPABASE_URL;
// Nama baru Supabase: SUPABASE_SECRET_KEY. SUPABASE_SERVICE_KEY tetap diterima (nama lama).
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key) {
  console.error('PERINGATAN: SUPABASE_URL / SUPABASE_SECRET_KEY belum diisi di .env');
}

// Secret key hanya dipakai di server, tidak pernah dikirim ke browser.
const supabase = createClient(url || 'http://localhost', key || 'placeholder', {
  auth: { persistSession: false }
});

module.exports = supabase;