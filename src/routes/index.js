const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const tangkap = require('../utils/tangkap');
const { wajibLogin } = require('../middleware/auth');
const { TUJUAN_LOGIN } = require('../controllers/authController');
const penghuni = require('../controllers/penghuniController');

router.get('/', (req, res) => {
  if (req.user) return res.redirect(TUJUAN_LOGIN[req.user.role]);
  res.redirect('/masuk');
});

router.use(require('./authRoutes'));

// ----- Penghuni -----
router.use(require('./tagihanRoutes'));
router.use(require('./akunRoutes'));
router.use(require('./asistenRoutes'));
router.get('/beranda', wajibLogin('penghuni'), tangkap(penghuni.beranda));

// Halaman sementara untuk menu yang belum dibangun
const segera = (judul) => (req, res) => res.render('pages/segera', { title: judul, judul });
router.get('/riwayat', wajibLogin('penghuni'), segera('Riwayat'));
router.get('/pengaturan', wajibLogin('penghuni'), segera('Pengaturan'));
router.get('/tagihan/:id', wajibLogin('penghuni'), segera('Detail Tagihan'));
router.get('/asisten', wajibLogin(), segera('Asisten AI'));
router.get('/notifikasi', wajibLogin(), segera('Notifikasi'));

// ----- Pemilik -----
router.use(require('./pengelolaRoutes'));
router.use(require('./kasRoutes'));
router.get('/pemilik', wajibLogin('pemilik'), (req, res) =>
  res.render('pages/dashboard', { title: 'Beranda Pemilik', peran: 'Pemilik' }));
router.get('/pemilik/tagihan', wajibLogin('pemilik'), segera('Tagihan'));
router.get('/pemilik/kas', wajibLogin('pemilik'), segera('Kas'));
router.get('/pemilik/kos', wajibLogin('pemilik'), segera('Kos'));
router.get('/pemilik/pengaturan', wajibLogin('pemilik'), segera('Pengaturan'));

// ----- Admin -----
router.get('/admin', wajibLogin('admin'), (req, res) =>
  res.render('pages/dashboard', { title: 'Beranda Admin', peran: 'Admin' }));
router.get('/admin/tagihan', wajibLogin('admin'), segera('Tagihan'));
router.get('/admin/kas', wajibLogin('admin'), segera('Kas'));
router.get('/admin/pengaturan', wajibLogin('admin'), segera('Pengaturan'));

// Cek koneksi ke Supabase (hapus nanti saat produksi)
router.get('/health', async (req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    return res.status(500).json({ status: 'error', message: process.env.NODE_ENV === 'production' ? 'Database tidak dapat dihubungi' : error.message });
  }
  res.json({ status: 'ok', message: 'Server & Supabase terhubung' });
});

module.exports = router;