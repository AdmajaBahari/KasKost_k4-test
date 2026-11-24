const express = require('express');
const c = require('../controllers/kasController');
const tangkap = require('../utils/tangkap');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
const pemilik = wajibLogin('pemilik');
const admin = wajibLogin('admin');

router.get('/pemilik/kas', pemilik, tangkap(c.laporan));
router.get('/pemilik/kas/pengeluaran', pemilik, tangkap(c.formPengeluaran));
router.post('/pemilik/kas/pengeluaran', pemilik, tangkap(c.simpanPengeluaran));

// Admin tidak punya beranda: langsung ke antrean verifikasi
router.get('/admin', admin, (req, res) => res.redirect('/admin/tagihan/antrean'));
router.get('/admin/kas', admin, tangkap(c.laporan));
router.get('/admin/pengeluaran', admin, tangkap(c.formPengeluaran));
router.post('/admin/pengeluaran', admin, tangkap(c.simpanPengeluaran));

module.exports = router;