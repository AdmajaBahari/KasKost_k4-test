const express = require('express');
const c = require('../controllers/asistenController');
const tangkap = require('../utils/tangkap');
const { wajibLogin } = require('../middleware/auth');

const router = express.Router();
router.get('/asisten', wajibLogin(), tangkap(c.halaman));
router.post('/asisten/tanya', wajibLogin(), c.tanya);

module.exports = router;