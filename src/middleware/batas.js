const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

const tolak = (req, res) => res.status(429).send('Terlalu banyak permintaan. Tunggu beberapa saat lalu coba lagi.');
const dasar = { standardHeaders: true, legacyHeaders: false, handler: tolak };
const ip = (req) => ipKeyGenerator(req.ip || '');

module.exports = {
  // pelindung umum per IP
  global: rateLimit({ ...dasar, windowMs: 5 * 60 * 1000, limit: 400 }),
  // hanya percobaan gagal yang dihitung; kunci = IP + email
  login: rateLimit({
    ...dasar, windowMs: 15 * 60 * 1000, limit: 8, skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ip(req)}|${String((req.body && req.body.email) || '').toLowerCase().slice(0, 254)}`
  }),
  daftar: rateLimit({ ...dasar, windowMs: 60 * 60 * 1000, limit: 5 }),
  kode: rateLimit({ ...dasar, windowMs: 15 * 60 * 1000, limit: 10 }),
  akun: rateLimit({ ...dasar, windowMs: 15 * 60 * 1000, limit: 10 })
};