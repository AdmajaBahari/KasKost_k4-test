const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { emailValid, passwordKuat } = require('../utils/validasi');
const { buatToken, bacaToken, opsiCookie } = require('../utils/token');
const kodeService = require('../services/kodeService');

const HARI = 24 * 60 * 60 * 1000;
const TUJUAN_LOGIN = { penghuni: '/beranda', pemilik: '/pemilik', admin: '/admin' };
const HASH_PALSU = bcrypt.hashSync('kaskost-tidak-dipakai', 10);
const DEV = process.env.NODE_ENV !== 'production';

const CFG_PENGHUNI = {
  peranBoleh: ['penghuni'],
  judul: 'Masuk sebagai Penghuni',
  sub: 'Gunakan email yang Anda daftarkan.',
  aksi: '/masuk',
  tautan: [
    { teks: 'Belum punya akun?', label: 'Daftar', href: '/daftar' },
    { teks: 'Pemilik atau Admin?', label: 'Masuk sebagai pengelola', href: '/masuk-pengelola' }
  ]
};
const CFG_PENGELOLA = {
  peranBoleh: ['pemilik', 'admin'],
  judul: 'Masuk sebagai Pengelola',
  sub: 'Khusus Pemilik dan Admin kos.',
  aksi: '/masuk-pengelola',
  tautan: [{ teks: 'Penghuni?', label: 'Masuk sebagai penghuni', href: '/masuk' }]
};

const render = (res, view, data = {}, status = 200) =>
  res.status(status).render(view, {
    layout: 'layouts/auth', info: null, error: null, form: {}, ...data
  });

async function kamarKosong() {
  const { data } = await supabase.from('kamar').select('id, nama').eq('status', 'kosong');
  return (data || []).sort((a, b) => a.nama.localeCompare(b.nama, 'id', { numeric: true }));
}

function masukkanSesi(res, user) {
  res.clearCookie('kk_pending');
  res.cookie('kk_token', buatToken({ uid: user.id, tujuan: 'sesi', v: user.token_versi || 0 }, '7d'), opsiCookie(7 * HARI));
}

function tandaiPending(res, user) {
  res.cookie('kk_pending', buatToken({ uid: user.id, tujuan: 'pending' }, '1d'), opsiCookie(HARI));
}

async function penggunaPending(req) {
  const p = bacaToken(req.cookies && req.cookies.kk_pending);
  if (!p || p.tujuan !== 'pending') return null;
  const { data } = await supabase.from('users')
    .select('id, email, role, status_akun, alasan_penolakan').eq('id', p.uid).maybeSingle();
  return data || null;
}

// ----- Registrasi -----
async function getDaftar(req, res) {
  if (req.user) return res.redirect(TUJUAN_LOGIN[req.user.role]);
  render(res, 'pages/auth/daftar', { title: 'Daftar', kamar: await kamarKosong() });
}

async function postDaftar(req, res) {
  const { kamar_id, email, password, konfirmasi } = req.body;
  const em = String(email || '').trim().toLowerCase();
  const kamar = await kamarKosong();
  const balik = (field, pesan) => render(res, 'pages/auth/daftar', {
    title: 'Daftar', kamar, form: { kamar_id, email: em }, error: { field, pesan }
  }, 400);

  if (!kamar.some((k) => k.id === kamar_id)) return balik('kamar_id', 'Pilih kamar yang tersedia.');
  if (!emailValid(em)) return balik('email', 'Format email belum benar.');
  if (!passwordKuat(password)) {
    return balik('password', 'Password lemah. Minimal 8 karakter, kombinasi huruf dan angka.');
  }
  if (password !== konfirmasi) return balik('konfirmasi', 'Konfirmasi password tidak sama.');

  const { data: ada } = await supabase.from('users').select('id').eq('email', em).maybeSingle();
  if (ada) return balik('email', 'Email sudah dipakai. Silakan masuk.');

  const password_hash = await bcrypt.hash(password, 10);
  const { data: user, error: eUser } = await supabase.from('users')
    .insert({ email: em, password_hash, role: 'penghuni', status_akun: 'menunggu_email' })
    .select('id, email').single();
  if (eUser) {
    if (eUser.code === '23505') return balik('email', 'Email sudah dipakai. Silakan masuk.');
    throw eUser;
  }

  const { error: ePh } = await supabase.from('penghuni').insert({ user_id: user.id, kamar_id, aktif: false });
  if (ePh) {
    await supabase.from('users').delete().eq('id', user.id);
    throw ePh;
  }

  tandaiPending(res, user);
  await kodeService.kirimKode(user, 'registrasi');
  res.redirect('/verifikasi');
}

// ----- Verifikasi kode -----
function teksInfo(q) {
  if (q.info === 'terkirim') return 'Kode baru sudah dikirim.';
  if (q.info === 'tunggu') return `Tunggu ${Number(q.detik) || 60} detik sebelum meminta kode baru.`;
  return null;
}

async function getVerifikasi(req, res) {
  const user = await penggunaPending(req);
  if (!user) return res.redirect('/daftar');
  if (user.status_akun !== 'menunggu_email') return res.redirect('/status-akun');
  render(res, 'pages/auth/verifikasi', { title: 'Verifikasi', email: user.email, info: teksInfo(req.query), dev: DEV });
}

async function postVerifikasi(req, res) {
  const user = await penggunaPending(req);
  if (!user) return res.redirect('/daftar');
  if (user.status_akun !== 'menunggu_email') return res.redirect('/status-akun');

  const kode = String((req.body && req.body.kode) || '').trim();
  const balik = (pesan) => render(res, 'pages/auth/verifikasi', {
    title: 'Verifikasi', email: user.email, error: pesan, dev: DEV
  }, 400);

  if (!/^\d{6}$/.test(kode)) return balik('Masukkan 6 digit kode.');

  const hasil = await kodeService.cekKode(user, 'registrasi', kode);
  if (!hasil.ok) {
    const pesan = {
      salah: `Kode salah. Sisa percobaan: ${hasil.sisa}.`,
      kadaluarsa: 'Kode sudah kedaluwarsa. Kirim ulang kode.',
      terlalu_banyak: 'Terlalu banyak percobaan salah. Kirim ulang kode.',
      tidak_ada: 'Kode belum dikirim. Kirim ulang kode.'
    }[hasil.alasan];
    return balik(pesan);
  }

  await supabase.from('users').update({ status_akun: 'menunggu_persetujuan' }).eq('id', user.id);
  res.redirect('/status-akun');
}

async function postKirimUlang(req, res) {
  const user = await penggunaPending(req);
  if (!user) return res.redirect('/daftar');
  if (user.status_akun !== 'menunggu_email') return res.redirect('/status-akun');
  const hasil = await kodeService.kirimKode(user, 'registrasi');
  if (!hasil.ok) return res.redirect(`/verifikasi?info=tunggu&detik=${hasil.tunggu}`);
  res.redirect('/verifikasi?info=terkirim');
}

async function getStatusAkun(req, res) {
  const user = await penggunaPending(req);
  if (!user) return res.redirect('/masuk');
  if (user.status_akun === 'menunggu_email') return res.redirect('/verifikasi');
  if (user.status_akun === 'menunggu_persetujuan') {
    return render(res, 'pages/auth/menunggu', { title: 'Menunggu persetujuan' });
  }
  if (user.status_akun === 'ditolak') {
    return render(res, 'pages/auth/ditolak', { title: 'Pendaftaran ditolak', alasan: user.alasan_penolakan });
  }
  res.redirect('/masuk');
}

// ----- Login -----
function tampilMasuk(cfg) {
  return async (req, res) => {
    if (req.user) return res.redirect(TUJUAN_LOGIN[req.user.role]);
    const info = req.query.info === 'keluar' ? 'Kamu sudah keluar.' : null;
    render(res, 'pages/auth/masuk', { title: 'Masuk', ...cfg, info });
  };
}

function prosesMasuk(cfg) {
  return async (req, res) => {
    const em = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const tampil = (error, status = 401) =>
      render(res, 'pages/auth/masuk', { title: 'Masuk', ...cfg, form: { email: em }, error }, status);

    const { data: user } = await supabase.from('users').select('*').eq('email', em).maybeSingle();
    const cocok = await bcrypt.compare(password, user ? user.password_hash : HASH_PALSU);
    if (!user || !cocok || !cfg.peranBoleh.includes(user.role)) {
      return tampil('Email atau password salah.');
    }

    if (user.status_akun === 'aktif') {
      masukkanSesi(res, user);
      return res.redirect(TUJUAN_LOGIN[user.role]);
    }
    if (user.status_akun === 'nonaktif') {
      return tampil('Akun dinonaktifkan. Hubungi pengelola kos.', 403);
    }

    tandaiPending(res, user);
    if (user.status_akun === 'menunggu_email') {
      await kodeService.kirimKode(user, 'registrasi'); // jeda 60 detik berlaku, abaikan hasilnya
      return res.redirect('/verifikasi');
    }
    res.redirect('/status-akun'); // menunggu_persetujuan atau ditolak
  };
}

function keluar(req, res) {
  res.clearCookie('kk_token');
  res.clearCookie('kk_pending');
  res.redirect('/masuk?info=keluar');
}

module.exports = {
  TUJUAN_LOGIN,
  getDaftar, postDaftar,
  getVerifikasi, postVerifikasi, postKirimUlang, getStatusAkun,
  getMasukPenghuni: tampilMasuk(CFG_PENGHUNI),
  postMasukPenghuni: prosesMasuk(CFG_PENGHUNI),
  getMasukPengelola: tampilMasuk(CFG_PENGELOLA),
  postMasukPengelola: prosesMasuk(CFG_PENGELOLA),
  keluar
};