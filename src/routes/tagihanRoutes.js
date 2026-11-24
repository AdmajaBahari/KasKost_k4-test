const express = require('express');
const multer = require('multer');
const c = require('../controllers/tagihanController');
const tangkap = require('../utils/tangkap');
const { wajibLogin } = require('../middleware/auth');
const csrf = require('../middleware/csrf');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Kesalahan unggah (mis. ukuran) ditampilkan di halaman, bukan sebagai error server
function terimaFile(req, res, next) {
  upload.single('bukti')(req, res, (err) => {
    if (err) {
      req.errUpload = err.code === 'LIMIT_FILE_SIZE'
        ? 'Ukuran foto maksimal 5 MB.'
        : 'File tidak dapat dibaca. Coba foto lain.';
    }
    next();
  });
}

const router = express.Router();
router.use('/tagihan', wajibLogin('penghuni'));
router.get('/tagihan/:id', tangkap(c.detail));
router.get('/tagihan/:id/unggah', tangkap(c.formUnggah));
router.post('/tagihan/:id/unggah', terimaFile, csrf.periksa, tangkap(c.kirim));
router.get('/tagihan/:id/hasil/:buktiId', tangkap(c.hasil));

module.exports = router;