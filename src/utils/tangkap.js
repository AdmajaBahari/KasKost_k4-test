// Pembungkus handler async supaya error tidak membuat server crash (Express 4).
module.exports = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(err);
    res.status(500).send('Terjadi kesalahan pada server.');
  });