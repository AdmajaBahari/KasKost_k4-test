const fmt = require('../utils/format');
const kas = require('../services/kasService');

const KONF = {
  pemilik: { laporan: '/pemilik/kas', pengeluaran: '/pemilik/kas/pengeluaran' },
  admin: { laporan: '/admin/kas', pengeluaran: '/admin/pengeluaran' }
};

async function laporan(req, res) {
  const peran = req.user.role;
  const d = await kas.laporan({
    peran,
    bulan: String(req.query.bulan || ''),
    kas: String(req.query.kas || ''),
    jenis: String(req.query.jenis || '')
  });
  res.render('pages/pengelola/kas-laporan', {
    title: peran === 'admin' ? 'Laporan Kas Kos' : 'Laporan Kas Lengkap', peran, k: KONF[peran], d
  });
}

async function tampilForm(req, res, { form = {}, error = null, status = 200 } = {}) {
  const peran = req.user.role;
  res.status(status).render('pages/pengelola/pengeluaran', {
    title: 'Catat Pengeluaran', peran, k: KONF[peran], form, error,
    opsi: kas.opsiUntuk(peran),
    terakhir: await kas.daftarTerakhir(peran),
    hariIni: fmt.hariIniWIB(),
    info: req.query.info === 'tersimpan' ? 'tersimpan' : null
  });
}

const formPengeluaran = (req, res) => tampilForm(req, res);

async function simpanPengeluaran(req, res) {
  const b = req.body || {};
  const masuk = {
    tanggal: String(b.tanggal || ''), kategori: String(b.kategori || ''),
    nominal: String(b.nominal || ''), catatan: String(b.catatan || '')
  };
  const hasil = await kas.catatPengeluaran({ user: req.user, ...masuk });
  if (!hasil.ok) return tampilForm(req, res, { form: masuk, error: hasil.error, status: 400 });
  res.redirect(`${KONF[req.user.role].pengeluaran}?info=tersimpan`);
}

module.exports = { laporan, formPengeluaran, simpanPengeluaran };