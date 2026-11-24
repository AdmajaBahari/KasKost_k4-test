const express = require('express');
const c = require('../controllers/authController');
const tangkap = require('../utils/tangkap');
const batas = require('../middleware/batas');
const router = express.Router();

router.get('/daftar', tangkap(c.getDaftar));
router.post('/daftar', batas.daftar, tangkap(c.postDaftar));

router.get('/verifikasi', tangkap(c.getVerifikasi));
router.post('/verifikasi', batas.kode, tangkap(c.postVerifikasi));
router.post('/verifikasi/kirim-ulang', batas.kode, tangkap(c.postKirimUlang));
router.get('/status-akun', tangkap(c.getStatusAkun));

router.get('/masuk', tangkap(c.getMasukPenghuni));
router.post('/masuk', batas.login, tangkap(c.postMasukPenghuni));
router.get('/masuk-pengelola', tangkap(c.getMasukPengelola));
router.post('/masuk-pengelola', batas.login, tangkap(c.postMasukPengelola));

router.post('/keluar', c.keluar);

module.exports = router;