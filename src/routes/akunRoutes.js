const express = require('express');
const c = require('../controllers/akunController');
const tangkap = require('../utils/tangkap');
const batas = require('../middleware/batas');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();

// Pengaturan akun: tiap peran punya alamat sendiri
[['penghuni', '/pengaturan'], ['pemilik', '/pemilik/pengaturan'], ['admin', '/admin/pengaturan']].forEach(([peran, basis]) => {
  const jaga = wajibLogin(peran);
  router.get(basis, jaga, tangkap(c.pengaturan));
  router.post(basis + '/nama', jaga, tangkap(c.simpanNama));
  router.post(basis + '/password', jaga, batas.akun, tangkap(c.ubahPassword));
  router.post(basis + '/email', jaga, batas.akun, tangkap(c.mulaiUbahEmail));
  router.post(basis + '/email/verifikasi', jaga, batas.akun, tangkap(c.verifikasiEmail));
  router.post(basis + '/email/kirim-ulang', jaga, tangkap(c.kirimUlangEmail));
  router.post(basis + '/email/batal', jaga, tangkap(c.batalEmail));
});

router.get('/notifikasi', wajibLogin(), tangkap(c.notifikasi));
router.post('/notifikasi/baca-semua', wajibLogin(), tangkap(c.bacaSemua));
router.post('/notifikasi/:id/baca', wajibLogin(), tangkap(c.bacaNotifikasi));

router.get('/riwayat', wajibLogin('penghuni'), tangkap(c.riwayat));
router.get('/riwayat/bukti/:id', wajibLogin('penghuni'), tangkap(c.lihatBukti));

module.exports = router;