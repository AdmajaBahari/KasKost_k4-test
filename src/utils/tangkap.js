// Pembungkus handler async: error ditangkap dan dijawab 500 tanpa membuat server crash.
module.exports = (fn) => (req, res, next) =>
  Promise.resolve().then(() => fn(req, res, next)).catch((err) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).send('Terjadi kesalahan pada server.');
  });
