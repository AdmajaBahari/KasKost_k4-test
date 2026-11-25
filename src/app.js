require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const { muatPengguna } = require('./middleware/auth');
const batas = require('./middleware/batas');
const csrf = require('./middleware/csrf');

const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// Di belakang proxy (Render, Railway, Nginx): isi TRUST_PROXY=1 agar IP klien dan cookie aman terbaca benar
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', /^\d+$/.test(process.env.TRUST_PROXY) ? Number(process.env.TRUST_PROXY) : process.env.TRUST_PROXY);
}

let asalSupabase = null;
try { asalSupabase = new URL(process.env.SUPABASE_URL).origin; } catch (e) { /* diabaikan */ }

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      styleSrcAttr: ["'unsafe-inline'"],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'].concat(asalSupabase ? [asalSupabase] : []),
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: PROD ? [] : null
    }
  },
  hsts: PROD
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/app');
app.locals.fmt = require('./utils/format');

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(batas.global);

app.use(express.json({ limit: '20kb' }));
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(cookieParser());
app.use(csrf.lindungi);

app.use(require('./routes/jobRoutes'));
app.use(muatPengguna);
app.use('/', require('./routes'));

app.use((req, res) => {
  res.status(404).send('Halaman tidak ditemukan');
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Terjadi kesalahan pada server.');
});

// Job tagihan bulanan, telat, denda, dan pengingat: saat server menyala dan tiap jam
const jalankanJob = () => require('./services/tagihanService').jalankanJob()
  .catch((e) => console.error('[JOB] gagal:', e.message));

// Di Vercel, app diekspor dan dijalankan sebagai fungsi serverless (tanpa listen dan tanpa timer).
// Di laptop atau server biasa (node src/app.js), app berjalan seperti semula.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`KasKost berjalan di http://localhost:${PORT}${PROD ? ' (production)' : ''}`);
    setTimeout(jalankanJob, 3000);
    setInterval(jalankanJob, 60 * 60 * 1000).unref();
  });
}

module.exports = app;
