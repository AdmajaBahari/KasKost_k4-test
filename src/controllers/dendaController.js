const dendaService = require('../services/dendaService');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASIS = '/pemilik/tagihan/denda';

async function tampil(req, res, { form = {}, error = null, status = 200 } = {}) {
  res.status(status).render('pages/pengelola/denda-manual', {
    title: 'Tagihan',
    pil: await dendaService.pilihan(),
    terakhir: await dendaService.terakhir(),
    form, error,
    info: ['ditambah', 'dibatalkan', 'gagal'].includes(req.query.info) ? req.query.info : null
  });
}

const halaman = (req, res) => tampil(req, res);

async function simpan(req, res) {
  const b = req.body || {};
  const masuk = {
    penghuni_id: String(b.penghuni_id || ''), periode: String(b.periode || ''),
    alasan: String(b.alasan || ''), nominal: String(b.nominal || '')
  };
  const r = await dendaService.beriDenda({
    pengelola: req.user, penghuniId: masuk.penghuni_id, periode: masuk.periode, alasan: masuk.alasan, nominal: masuk.nominal
  });
  if (!r.ok) return tampil(req, res, { form: masuk, error: r.error, status: 400 });
  res.redirect(`${BASIS}?info=ditambah`);
}

async function batal(req, res) {
  if (!UUID.test(req.params.id)) return res.redirect(`${BASIS}?info=gagal`);
  const r = await dendaService.batalkan(req.params.id);
  res.redirect(`${BASIS}?info=${r.ok ? 'dibatalkan' : 'gagal'}`);
}

module.exports = { halaman, simpan, batal };