const express = require('express');
const c = require('../controllers/pengelolaController');
const k = require('../controllers/kosController');
const dn = require('../controllers/dendaController');
const tangkap = require('../utils/tangkap');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
const segera = (judul) => (req, res) => res.render('pages/segera', { title: judul, judul });
const pemilik = wajibLogin('pemilik');

router.get('/pemilik', pemilik, tangkap(c.berandaPemilik));

// Antrean verifikasi: Pemilik (semua jenis) dan Admin (Kelompok B)
[['pemilik', '/pemilik/tagihan'], ['admin', '/admin/tagihan']].forEach(([peran, basis]) => {
  const jaga = wajibLogin(peran);
  router.get(basis, jaga, (req, res) => res.redirect(basis + (peran === 'pemilik' ? '/semua' : '/antrean')));
  router.get(basis + '/antrean', jaga, tangkap(c.antrean));
  router.post(basis + '/antrean/:id/setujui', jaga, tangkap(c.setujui));
  router.post(basis + '/antrean/:id/tolak', jaga, tangkap(c.tolak));
});
router.get('/pemilik/tagihan/semua', pemilik, tangkap(k.semuaTagihan));
router.get('/pemilik/tagihan/bukti/:id', pemilik, tangkap(k.lihatBukti));
router.get('/pemilik/tagihan/denda', pemilik, tangkap(dn.halaman));
router.post('/pemilik/tagihan/denda', pemilik, tangkap(dn.simpan));
router.post('/pemilik/tagihan/denda/:id/batal', pemilik, tangkap(dn.batal));

// Kos
router.get('/pemilik/kos', pemilik, (req, res) => res.redirect('/pemilik/kos/pendaftar'));
router.get('/pemilik/kos/pendaftar', pemilik, tangkap(c.pendaftar));
router.post('/pemilik/kos/pendaftar/:id/setujui', pemilik, tangkap(c.setujuiPendaftar));
router.post('/pemilik/kos/pendaftar/:id/tolak', pemilik, tangkap(c.tolakPendaftar));
router.get('/pemilik/kos/penghuni', pemilik, tangkap(k.penghuni));
router.post('/pemilik/kos/penghuni/:id/pindah', pemilik, tangkap(k.pindah));
router.post('/pemilik/kos/penghuni/:id/nonaktifkan', pemilik, tangkap(k.nonaktifkanPenghuni));
router.post('/pemilik/kos/penghuni/:id/aktifkan', pemilik, tangkap(k.aktifkanPenghuni));
router.get('/pemilik/kos/kamar', pemilik, tangkap(k.kamar));
router.post('/pemilik/kos/kamar/tambah', pemilik, tangkap(k.tambahKamar));
router.post('/pemilik/kos/kamar/:id/ubah', pemilik, tangkap(k.ubahKamar));
router.post('/pemilik/kos/kamar/:id/nonaktifkan', pemilik, tangkap(k.nonaktifkanKamar));
router.post('/pemilik/kos/kamar/:id/aktifkan', pemilik, tangkap(k.aktifkanKamar));

module.exports = router;