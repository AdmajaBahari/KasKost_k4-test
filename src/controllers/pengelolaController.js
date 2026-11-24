const fmt = require('../utils/format');
const pengelola = require('../services/pengelolaService');
const antreanService = require('../services/antreanService');
const penghuniService = require('../services/penghuniService');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const labelJenis = (j) => (j === 'DENDA' ? 'Denda' : `Kelompok ${j}`);
const basisAntrean = (peran) => (peran === 'admin' ? '/admin/tagihan/antrean' : '/pemilik/tagihan/antrean');
const infoValid = (q, daftar) => (daftar.includes(q) ? q : null);

function labelPenolakan(r, total) {
  const alasan = r.alasan_penolakan || '';
  if (r.status === 'duplikat' || /sudah dipakai/i.test(alasan)) return 'Bukti ganda';
  if (r.status === 'buram' || /tidak terbaca/i.test(alasan)) return 'Foto tidak terbaca';
  if (r.nominal_terbaca && r.nominal_terbaca !== total) return `Nominal tidak sama (${fmt.rupiah(r.nominal_terbaca)})`;
  return alasan || 'Ditolak';
}

// ----- Beranda Pemilik -----
async function berandaPemilik(req, res) {
  const d = await pengelola.berandaPemilik();
  res.render('pages/pengelola/beranda-pemilik', { title: 'Beranda Pemilik', d });
}

// ----- Antrean verifikasi -----
async function antrean(req, res) {
  const peran = req.user.role;
  const basis = basisAntrean(peran);
  const semua = await antreanService.daftarAntrean(peran);

  const hitung = { semua: semua.length, A: 0, B: 0, DENDA: 0 };
  semua.forEach((b) => { hitung[b.tagihan.jenis] += 1; });

  const jenis = ['A', 'B', 'DENDA'].includes(req.query.jenis) ? req.query.jenis : null;
  const daftar = jenis ? semua.filter((b) => b.tagihan.jenis === jenis) : semua;
  const terpilih = daftar.find((b) => b.id === req.query.id) || daftar[0] || null;

  let foto = null;
  let riwayat = [];
  if (terpilih) {
    foto = await antreanService.urlFoto(terpilih.file_path);
    const rows = await antreanService.riwayatPenolakan(terpilih.tagihan_id);
    riwayat = rows.map((r) => labelPenolakan(r, terpilih.tagihan.total));
  }

  res.render('pages/pengelola/antrean', {
    title: 'Antrean Verifikasi', peran, basis, semua, hitung, jenis, daftar, terpilih, foto, riwayat, labelJenis,
    info: infoValid(req.query.info, ['disetujui', 'ditolak', 'gagal'])
  });
}

async function putuskanBukti(req, res, setuju) {
  const basis = basisAntrean(req.user.role);
  if (!UUID.test(req.params.id)) return res.redirect(`${basis}?info=gagal`);
  const alasan = setuju ? null : String((req.body && req.body.alasan) || '').trim().slice(0, 200) || null;
  const r = await antreanService.putuskan({ buktiId: req.params.id, pengelola: req.user, setuju, alasan });
  res.redirect(`${basis}?info=${r.ok ? (setuju ? 'disetujui' : 'ditolak') : 'gagal'}`);
}
const setujui = (req, res) => putuskanBukti(req, res, true);
const tolak = (req, res) => putuskanBukti(req, res, false);

// ----- Persetujuan pendaftar -----
async function pendaftar(req, res) {
  const daftar = await pengelola.daftarPendaftar();
  res.render('pages/pengelola/pendaftar', {
    title: 'Kos', daftar, fmt,
    info: infoValid(req.query.info, ['disetujui', 'ditolak', 'gagal'])
  });
}

async function setujuiPendaftar(req, res) {
  if (!UUID.test(req.params.id)) return res.redirect('/pemilik/kos/pendaftar?info=gagal');
  const r = await penghuniService.setujuiPendaftar(req.params.id);
  res.redirect(`/pemilik/kos/pendaftar?info=${r.ok ? 'disetujui' : 'gagal'}`);
}

async function tolakPendaftar(req, res) {
  if (!UUID.test(req.params.id)) return res.redirect('/pemilik/kos/pendaftar?info=gagal');
  const alasan = String((req.body && req.body.alasan) || '').trim().slice(0, 200) || null;
  const r = await penghuniService.tolakPendaftar(req.params.id, alasan);
  res.redirect(`/pemilik/kos/pendaftar?info=${r.ok ? 'ditolak' : 'gagal'}`);
}

module.exports = { berandaPemilik, antrean, setujui, tolak, pendaftar, setujuiPendaftar, tolakPendaftar };