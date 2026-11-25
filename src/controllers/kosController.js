const supabase = require('../config/supabase');
const kos = require('../services/kosService');
const antreanService = require('../services/antreanService');
const { semuaTagihan: ambilSemua } = require('../services/semuaTagihanService');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const infoValid = (q, daftar) => (daftar.includes(q) ? q : null);
const FILTER_TAGIHAN = ['lunas', 'menunggu_verifikasi', 'telat', 'belum_dibayar'];

// ----- Semua tagihan -----
async function semuaTagihan(req, res) {
  const status = FILTER_TAGIHAN.includes(req.query.status) ? req.query.status : null;
  const d = await ambilSemua({ bulan: String(req.query.bulan || ''), status, id: String(req.query.id || '') });
  res.render('pages/pengelola/tagihan-semua', { title: 'Tagihan', d });
}

async function lihatBukti(req, res) {
  if (!UUID.test(req.params.id)) return res.status(404).send('Halaman tidak ditemukan');
  const { data: b, error } = await supabase.from('bukti_pembayaran').select('file_path').eq('id', req.params.id).maybeSingle();
  if (error) throw error;
  if (!b) return res.status(404).send('Halaman tidak ditemukan');
  const url = await antreanService.urlFoto(b.file_path);
  if (!url) return res.status(404).send('Foto tidak tersedia.');
  res.redirect(url);
}

// ----- Kelola penghuni -----
async function penghuni(req, res) {
  const status = ['aktif', 'nonaktif'].includes(req.query.status) ? req.query.status : null;
  const semua = await kos.daftarPenghuni();
  const daftar = status ? semua.filter((p) => p.status === status) : semua;
  const kosong = await kos.kamarKosong();
  res.render('pages/pengelola/kos-penghuni', {
    title: 'Kos', daftar, kosong, status,
    info: infoValid(req.query.info, ['dipindah', 'dinonaktifkan', 'diaktifkan', 'gagal'])
  });
}

async function pindah(req, res) {
  const kamarId = String((req.body && req.body.kamar_id) || '');
  if (!UUID.test(req.params.id) || !UUID.test(kamarId)) return res.redirect('/pemilik/kos/penghuni?info=gagal');
  const r = await kos.pindahkan(req.params.id, kamarId);
  res.redirect(`/pemilik/kos/penghuni?info=${r.ok ? 'dipindah' : 'gagal'}`);
}

async function nonaktifkanPenghuni(req, res) {
  if (!UUID.test(req.params.id)) return res.redirect('/pemilik/kos/penghuni?info=gagal');
  const r = await kos.nonaktifkanPenghuni(req.params.id);
  res.redirect(`/pemilik/kos/penghuni?info=${r.ok ? 'dinonaktifkan' : 'gagal'}`);
}

async function aktifkanPenghuni(req, res) {
  const kamarId = String((req.body && req.body.kamar_id) || '');
  if (!UUID.test(req.params.id) || !UUID.test(kamarId)) return res.redirect('/pemilik/kos/penghuni?info=gagal');
  const r = await kos.aktifkanPenghuni(req.params.id, kamarId);
  res.redirect(`/pemilik/kos/penghuni?info=${r.ok ? 'diaktifkan' : 'gagal'}`);
}

// ----- Kelola kamar -----
async function kamar(req, res) {
  const d = await kos.daftarKamar();
  res.render('pages/pengelola/kos-kamar', {
    title: 'Kos', d,
    info: infoValid(req.query.info, ['ditambah', 'diubah', 'dinonaktifkan', 'diaktifkan', 'duplikat', 'nama', 'gagal'])
  });
}

const kembali = (res, kode) => res.redirect(`/pemilik/kos/kamar?info=${kode}`);

async function tambahKamar(req, res) {
  const r = await kos.tambahKamar(req.body && req.body.nama);
  kembali(res, r.ok ? 'ditambah' : r.alasan);
}

async function ubahKamar(req, res) {
  if (!UUID.test(req.params.id)) return kembali(res, 'gagal');
  const r = await kos.ubahKamar(req.params.id, req.body && req.body.nama);
  kembali(res, r.ok ? 'diubah' : (r.alasan || 'gagal'));
}

async function nonaktifkanKamar(req, res) {
  if (!UUID.test(req.params.id)) return kembali(res, 'gagal');
  const r = await kos.nonaktifkanKamar(req.params.id);
  kembali(res, r.ok ? 'dinonaktifkan' : 'gagal');
}

async function aktifkanKamar(req, res) {
  if (!UUID.test(req.params.id)) return kembali(res, 'gagal');
  const r = await kos.aktifkanKamar(req.params.id);
  kembali(res, r.ok ? 'diaktifkan' : 'gagal');
}

module.exports = {
  semuaTagihan, lihatBukti, penghuni, pindah, nonaktifkanPenghuni, aktifkanPenghuni,
  kamar, tambahKamar, ubahKamar, nonaktifkanKamar, aktifkanKamar
};