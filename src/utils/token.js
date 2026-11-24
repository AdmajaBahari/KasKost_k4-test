const jwt = require('jsonwebtoken');
require('dotenv').config();

const SECRET = process.env.SESSION_SECRET;
const BELUM_DIISI = !SECRET || SECRET === 'ganti_dengan_string_acak';

if (BELUM_DIISI) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET wajib diisi di production.');
  }
  console.warn('PERINGATAN: SESSION_SECRET belum diisi string acak di .env (tidak aman).');
}
const kunci = BELUM_DIISI ? 'kunci-dev-tidak-aman' : SECRET;

function buatToken(payload, masaBerlaku) {
  return jwt.sign(payload, kunci, { expiresIn: masaBerlaku });
}

function bacaToken(token) {
  if (!token) return null;
  try { return jwt.verify(token, kunci); } catch (e) { return null; }
}

function opsiCookie(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxAgeMs
  };
}

module.exports = { buatToken, bacaToken, opsiCookie, kunci };