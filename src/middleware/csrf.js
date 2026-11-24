const crypto = require('crypto');
const { kunci } = require('../utils/token');

const NAMA = 'kk_csrf';
const AMAN = new Set(['GET', 'HEAD', 'OPTIONS']);
// Satu-satunya multipart yang diperiksa belakangan (setelah multer mem-parsing isi form)
const UNGGAH = /^\/tagihan\/[0-9a-f-]{36}\/unggah$/i;
// Dipanggil mesin dengan kunci rahasia, bukan browser
const JOB = '/internal/job';

const buatTanda = (nilai) => crypto.createHmac('sha256', kunci).update('csrf:' + nilai).digest('hex');
const sama = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function pastikanCookie(req, res) {
  let nilai = req.cookies && req.cookies[NAMA];
  if (!/^[0-9a-f]{64}$/.test(nilai || '')) {
    nilai = crypto.randomBytes(32).toString('hex');
    res.cookie(NAMA, nilai, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  return nilai;
}

function periksa(req, res, next) {
  const diterima = (req.body && req.body._csrf) || req.get('x-csrf-token') || '';
  if (!sama(diterima, req.csrfTanda)) {
    return res.status(403).send('Permintaan ditolak (token keamanan tidak valid). Muat ulang halaman lalu coba lagi.');
  }
  next();
}

function lindungi(req, res, next) {
  req.csrfTanda = buatTanda(pastikanCookie(req, res));
  res.locals.csrfToken = req.csrfTanda;

  if (AMAN.has(req.method)) return next();
  if (req.path === JOB) return next();
  if (req.is('multipart/form-data') && UNGGAH.test(req.path)) return next();
  periksa(req, res, next);
}

module.exports = { lindungi, periksa };