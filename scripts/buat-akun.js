// Pemakaian: node scripts/buat-akun.js <pemilik|admin> <email> '<password>' "<Nama Lengkap>"
require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../src/config/supabase');
const { emailValid, passwordKuat } = require('../src/utils/validasi');

(async () => {
  const [, , peran, email, password, ...nama] = process.argv;
  if (!['pemilik', 'admin'].includes(peran) || !emailValid(email || '') || !passwordKuat(password)) {
    console.log("Pemakaian: node scripts/buat-akun.js <pemilik|admin> <email> '<password>' \"<Nama>\"");
    console.log('Password minimal 8 karakter, kombinasi huruf dan angka.');
    process.exitCode = 1; return;
  }
  const { data, error } = await supabase.from('users').insert({
    email: email.toLowerCase(),
    password_hash: await bcrypt.hash(password, 10),
    nama_lengkap: nama.join(' ') || null,
    role: peran,
    status_akun: 'aktif'
  }).select('id, email, role').single();
  if (error) {
    console.log('Gagal:', error.code === '23505' ? 'email sudah terdaftar' : error.message);
    process.exitCode = 1; return;
  }
  console.log(`Akun ${data.role} dibuat: ${data.email}`);
})();