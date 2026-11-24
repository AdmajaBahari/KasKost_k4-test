require('dotenv').config();

const PROVIDER = (process.env.MAIL_PROVIDER || '').toLowerCase();
const DARI = process.env.MAIL_FROM || 'KasKost <onboarding@resend.dev>';
const PROD = process.env.NODE_ENV === 'production';

let smtp = null;
function ambilSmtp() {
  if (smtp) return smtp;
  const nodemailer = require('nodemailer');
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  smtp = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port, secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return smtp;
}

async function kirimEmail(ke, subjek, teks) {
  if (PROVIDER === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({ from: DARI, to: [ke], subject: subjek, text: teks })
    });
    if (!res.ok) {
      console.error('[EMAIL] Resend gagal, HTTP', res.status);
      throw new Error('Gagal mengirim email.');
    }
    return;
  }
  if (PROVIDER === 'smtp') {
    try {
      await ambilSmtp().sendMail({ from: DARI, to: ke, subject: subjek, text: teks });
    } catch (e) {
      console.error('[EMAIL] SMTP gagal:', e.code || e.message);
      throw new Error('Gagal mengirim email.');
    }
    return;
  }
  if (PROD) throw new Error('MAIL_PROVIDER belum diatur untuk production.');
  console.log(`\n[EMAIL-DEV] Ke: ${ke}\n${subjek}\n${teks}\n`);
}

async function kirimKodeVerifikasi(email, kode, tujuan) {
  const untuk = tujuan === 'ubah_email' ? 'email baru' : 'pendaftaran';
  await kirimEmail(
    email,
    'Kode verifikasi KasKost',
    `Kode verifikasi ${untuk} kamu: ${kode}\n\nKode berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun.\nAbaikan email ini jika kamu tidak memintanya.`
  );
}

module.exports = { kirimEmail, kirimKodeVerifikasi };