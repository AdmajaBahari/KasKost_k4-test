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

// ----- Pemilik & Admin -----
router.use(require('./pengelolaRoutes'));
router.use(require('./kasRoutes'));


// Cek koneksi ke Supabase (hapus nanti saat produksi)
router.get('/health', async (req, res) => {
  const { error } = await supabase.from('users').select('id').limit(1);
  if (error) {
    return res.status(500).json({ status: 'error', message: process.env.NODE_ENV === 'production' ? 'Database tidak dapat dihubungi' : error.message });
  }
  res.json({ status: 'ok', message: 'Server & Supabase terhubung' });
});

module.exports = router;