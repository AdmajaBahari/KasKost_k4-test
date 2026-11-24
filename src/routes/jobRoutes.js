const crypto = require('crypto');
const express = require('express');
const tagihanService = require('../services/tagihanService');

const router = express.Router();

const sama = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// POST /internal/job dengan header x-job-key: <JOB_KEY>
router.post('/internal/job', (req, res) => {
  const kunci = process.env.JOB_KEY || '';
  if (kunci.length < 16 || !sama(req.get('x-job-key') || '', kunci)) {
    return res.status(404).send('Halaman tidak ditemukan');
  }
  tagihanService.jalankanJob()
    .then(() => res.json({ ok: true }))
    .catch((e) => { console.error('[JOB] gagal:', e.message); res.status(500).json({ ok: false }); });
});

module.exports = router;