const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const { emailValid, passwordKuat } = require('../utils/validasi');
const kodeService = require('../services/kodeService');
const { buatToken, opsiCookie } = require('../utils/token');
const antreanService = require('../services/antreanService');
const riwayatService = require('../services/riwayatService');

const BASIS = { penghuni: '/pengaturan', pemilik: '/pemilik/pengaturan', admin: '/admin/pengaturan' };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NAMA_OK = /^[\p{L}][\p{L} .'\-]{1,59}$/u;
const INFO = ['nama', 'password', 'email', 'kode', 'tunggu'];

const samarkan = (email) => {
  const i = email.indexOf('@');
  return email.slice(0, Math.min(2, i)) + '***' + email.slice(i);
};

async function ambilHash(userId) {
  const { data, error } = await supabase.from('users').select('password_hash').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? data.password_hash : '';
}

async function dataProfil(req) {
  const { data: u, error } = await supabase.from('users').select('email, nama_lengkap').eq('id', req.user.id).maybeSingle();
  if (error) throw error;

  let kamar = null;
  if (req.user.role === 'penghuni') {
    const { data: ph } = await supabase.from('penghuni').select('kamar:kamar_id(nama)').eq('user_id', req.user.id).maybeSingle();
    kamar = ph && ph.kamar ? ph.kamar.nama : null;
  }

  const { data: kd } = await supabase.from('kode_verifikasi').select('email_baru, kadaluarsa')
    .eq('user_id', req.user.id).eq('tujuan', 'ubah_email').eq('dipakai', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  const pending = kd && kd.email_baru && new Date(kd.kadaluarsa) > new Date() ? kd.email_baru : null;

  return {
    nama: u.nama_lengkap || '', email: u.email, emailSamar: samarkan(u.email), kamar,
    pending, pendingSamar: pending ? samarkan(pending) : null
  };
}

async function tampil(req, res, { galat = {}, form = {}, info = null, status = 200, buka = null, detik = 60 } = {}) {
  res.status(status).render('pages/akun/pengaturan', {
    title: 'Pengaturan', peran: req.user.role, basis: BASIS[req.user.role],
    profil: await dataProfil(req), galat, form, info, buka, detik,
    dev: process.env.NODE_ENV !== 'production'
  });
}

async function pengaturan(req, res) {
  const info = INFO.includes(req.query.info) ? req.query.info : null;
  await tampil(req, res, { info, detik: Math.min(Math.max(parseInt(req.query.detik, 10) || 60, 1), 600) });
}

async function simpanNama(req, res) {
  const nama = String((req.body && req.body.nama) || '').replace(/\s+/g, ' ').trim();
  if (!NAMA_OK.test(nama)) {
    return tampil(req, res, {
      galat: { nama: 'Nama 2 sampai 60 karakter: huruf, spasi, titik, apostrof, atau strip.' },
      form: { nama }, status: 400
    });
  }
  const { error } = await supabase.from('users').update({ nama_lengkap: nama }).eq('id', req.user.id);
  if (error) throw error;
  res.redirect(`${BASIS[req.user.role]}?info=nama`);
}

async function ubahPassword(req, res) {
  const b = req.body || {};
  const sekarang = String(b.sekarang || '');
  const baru = String(b.baru || '');
  const konfirmasi = String(b.konfirmasi || '');
  const balik = (galat) => tampil(req, res, { galat, status: 400 });

  if (!(await bcrypt.compare(sekarang, await ambilHash(req.user.id)))) return balik({ sekarang: 'Password saat ini salah.' });
  if (!passwordKuat(baru)) return balik({ baru: 'Password lemah. Minimal 8 karakter, kombinasi huruf dan angka.' });
  if (baru !== konfirmasi) return balik({ konfirmasi: 'Konfirmasi password tidak sama.' });
  if (baru === sekarang) return balik({ baru: 'Password baru harus berbeda dari yang lama.' });

  const versiBaru = (req.user.token_versi || 0) + 1;
  const { error } = await supabase.from('users').update({ password_hash: await bcrypt.hash(baru, 10), token_versi: versiBaru }).eq('id', req.user.id);
  if (error) throw error;
  await supabase.from('notifikasi').insert({ user_id: req.user.id, judul: 'Password diubah', isi: 'Password akunmu baru saja diubah.' });
  res.cookie('kk_token', buatToken({ uid: req.user.id, tujuan: 'sesi', v: versiBaru }, '7d'), opsiCookie(7 * 24 * 60 * 60 * 1000));
  res.redirect(`${BASIS[req.user.role]}?info=password`);
}

// ----- Ubah email (kode dikirim ke email baru) -----
async function mulaiUbahEmail(req, res) {
  const basis = BASIS[req.user.role];
  const emailBaru = String((req.body && req.body.email_baru) || '').trim().toLowerCase();
  const password = String((req.body && req.body.password) || '');
  const balik = (galat) => tampil(req, res, { galat, form: { email_baru: emailBaru }, status: 400, buka: 'dlg-email' });

  if (!emailValid(emailBaru)) return balik({ email: 'Format email belum benar.' });
  if (emailBaru === req.user.email.toLowerCase()) return balik({ email: 'Email baru sama dengan email saat ini.' });
  if (!(await bcrypt.compare(password, await ambilHash(req.user.id)))) return balik({ pwEmail: 'Password salah.' });

  const { data: ada } = await supabase.from('users').select('id').eq('email', emailBaru).maybeSingle();
  if (ada) return balik({ email: 'Email sudah dipakai.' });

  const r = await kodeService.kirimKode(req.user, 'ubah_email', emailBaru);
  if (!r.ok) return res.redirect(`${basis}?info=tunggu&detik=${r.tunggu}`);
  res.redirect(`${basis}?info=kode`);
}

async function verifikasiEmail(req, res) {
  const kode = String((req.body && req.body.kode) || '').trim();
  const balik = (pesan) => tampil(req, res, { galat: { kode: pesan }, status: 400 });
  if (!/^\d{6}$/.test(kode)) return balik('Masukkan 6 digit kode.');

  const hasil = await kodeService.cekKode(req.user, 'ubah_email', kode);
  if (!hasil.ok) {
    return balik({
      salah: `Kode salah. Sisa percobaan: ${hasil.sisa}.`,
      kadaluarsa: 'Kode sudah kedaluwarsa. Ajukan ubah email lagi.',
      terlalu_banyak: 'Terlalu banyak percobaan salah. Kirim ulang kode.',
      tidak_ada: 'Kode belum dikirim. Ajukan ubah email lagi.'
    }[hasil.alasan]);
  }

  const { error } = await supabase.from('users').update({ email: hasil.rec.email_baru }).eq('id', req.user.id);
  if (error) {
    if (error.code === '23505') return balik('Email itu baru saja dipakai akun lain. Ajukan email lain.');
    throw error;
  }
  await supabase.from('notifikasi').insert({ user_id: req.user.id, judul: 'Email diubah', isi: 'Email akunmu berhasil diubah.' });
  res.redirect(`${BASIS[req.user.role]}?info=email`);
}

async function kirimUlangEmail(req, res) {
  const basis = BASIS[req.user.role];
  const { pending } = await dataProfil(req);
  if (!pending) return res.redirect(basis);
  const r = await kodeService.kirimKode(req.user, 'ubah_email', pending);
  if (!r.ok) return res.redirect(`${basis}?info=tunggu&detik=${r.tunggu}`);
  res.redirect(`${basis}?info=kode`);
}

async function batalEmail(req, res) {
  await supabase.from('kode_verifikasi').update({ dipakai: true })
    .eq('user_id', req.user.id).eq('tujuan', 'ubah_email').eq('dipakai', false);
  res.redirect(BASIS[req.user.role]);
}

// ----- Notifikasi -----
const ikonNotif = (judul) => {
  if (/denda|ditolak|telat/i.test(judul)) return 'alert';
  if (/diterima|disetujui|berhasil|lunas|diubah|dipindah/i.test(judul)) return 'check';
  if (/pengingat|diperiksa|menunggu/i.test(judul)) return 'clock';
  return 'bell';
};

function waktuNotif(ts) {
  const jam = new Date(ts).toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${fmt.tanggalDM(fmt.tanggalWIB(ts))}, ${jam.replace(':', '.')}`;
}

async function notifikasi(req, res) {
  const tab = req.query.tab === 'belum' ? 'belum' : 'semua';
  const { data, error } = await supabase.from('notifikasi')
    .select('id, judul, isi, dibaca, created_at').eq('user_id', req.user.id)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw error;

  const semua = (data || []).map((n) => ({ ...n, ikon: ikonNotif(n.judul), waktu: waktuNotif(n.created_at) }));
  res.render('pages/akun/notifikasi', {
    title: 'Notifikasi', tab, daftar: tab === 'belum' ? semua.filter((n) => !n.dibaca) : semua
  });
}

async function bacaNotifikasi(req, res) {
  if (UUID.test(req.params.id)) {
    await supabase.from('notifikasi').update({ dibaca: true }).eq('id', req.params.id).eq('user_id', req.user.id);
  }
  res.redirect(req.body && req.body.tab === 'belum' ? '/notifikasi?tab=belum' : '/notifikasi');
}

async function bacaSemua(req, res) {
  await supabase.from('notifikasi').update({ dibaca: true }).eq('user_id', req.user.id).eq('dibaca', false);
  res.redirect('/notifikasi');
}

// ----- Riwayat tagihan (penghuni) -----
async function riwayat(req, res) {
  const d = await riwayatService.riwayat(req.user.id, String(req.query.tahun || ''), String(req.query.periode || ''));
  res.render('pages/akun/riwayat', { title: 'Riwayat', d });
}

async function lihatBukti(req, res) {
  if (!UUID.test(req.params.id)) return res.status(404).send('Halaman tidak ditemukan');
  const { data: ph } = await supabase.from('penghuni').select('id').eq('user_id', req.user.id).maybeSingle();
  if (!ph) return res.status(404).send('Halaman tidak ditemukan');
  const { data: b } = await supabase.from('bukti_pembayaran').select('file_path')
    .eq('id', req.params.id).eq('penghuni_id', ph.id).eq('status', 'disetujui').maybeSingle();
  if (!b) return res.status(404).send('Halaman tidak ditemukan');
  const url = await antreanService.urlFoto(b.file_path);
  if (!url) return res.status(404).send('Foto tidak tersedia.');
  res.redirect(url);
}

module.exports = {
  pengaturan, simpanNama, ubahPassword, mulaiUbahEmail, verifikasiEmail, kirimUlangEmail, batalEmail,
  notifikasi, bacaNotifikasi, bacaSemua, riwayat, lihatBukti
};