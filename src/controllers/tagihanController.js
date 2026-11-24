const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const buktiService = require('../services/buktiService');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOLEH = ['belum_dibayar', 'telat', 'ditolak'];

const TAMPIL = {
  disetujui: { judul: 'Pembayaran Berhasil', badge: 'lunas', ikon: 'check', nada: 'ok' },
  nominal_beda: { judul: 'Bukti Ditolak', badge: 'ditolak', ikon: 'x', nada: 'bad' },
  ditolak: { judul: 'Bukti Ditolak', badge: 'ditolak', ikon: 'x', nada: 'bad' },
  buram: { judul: 'Foto Tidak Terbaca', badge: 'ditolak', ikon: 'x', nada: 'bad' },
  duplikat: { judul: 'Bukti Sudah Pernah Dipakai', badge: 'ditolak', ikon: 'x', nada: 'bad' },
  diperiksa_pengelola: { judul: 'Diperiksa Pengelola', badge: 'menunggu_verifikasi', ikon: 'clock', nada: 'warn' }
};
const PETUNJUK = {
  buram: 'Pastikan nominal terlihat jelas, foto tidak buram, dan cahaya cukup.',
  duplikat: 'Satu bukti hanya berlaku untuk satu tagihan.'
};

const tidakAda = (res) => res.status(404).send('Halaman tidak ditemukan');

async function muat(req, res) {
  if (!UUID.test(req.params.id)) { tidakAda(res); return null; }
  const { data: ph } = await supabase.from('penghuni').select('id, aktif').eq('user_id', req.user.id).maybeSingle();
  if (!ph || !ph.aktif) { tidakAda(res); return null; }

  const { data: t, error } = await supabase.from('tagihan')
    .select('id, jenis, periode, total, batas_bayar, status, tagihan_item(label, nominal)')
    .eq('id', req.params.id).eq('penghuni_id', ph.id).maybeSingle();
  if (error) throw error;
  if (!t) { tidakAda(res); return null; }

  t.tagihan_item = (t.tagihan_item || []).sort((a, b) => b.nominal - a.nominal);
  t.penghuni = { id: ph.id, userId: req.user.id };
  return t;
}

async function konteks(t) {
  const { data: rek } = await supabase.from('rekening_tujuan').select('*').eq('jenis', t.jenis).maybeSingle();
  const p = await buktiService.infoPercobaan(t.id);
  return {
    t,
    rek: rek || null,
    p,
    judul: t.jenis === 'DENDA' ? 'Denda' : `Kelompok ${t.jenis}`,
    ringkas: t.jenis === 'DENDA' ? 'Denda keterlambatan' : t.tagihan_item.map((i) => i.label).join(' + '),
    boleh: BOLEH.includes(t.status) && p.sisa > 0
  };
}

async function detail(req, res) {
  const t = await muat(req, res); if (!t) return;
  const k = await konteks(t);
  const { data: upaya } = await supabase.from('bukti_pembayaran')
    .select('id, status, alasan_penolakan, created_at')
    .eq('tagihan_id', t.id).neq('status', 'memproses').order('created_at', { ascending: false });
  res.render('pages/tagihan/detail', { title: k.judul, ...k, upaya: upaya || [] });
}

async function tampilUnggah(req, res, t, extra = {}, status = 200) {
  const k = await konteks(t);
  res.status(status).render('pages/tagihan/unggah', { title: 'Unggah Bukti', error: null, ...k, ...extra });
}

async function formUnggah(req, res) {
  const t = await muat(req, res); if (!t) return;
  const k = await konteks(t);
  if (!k.boleh) return res.redirect(`/tagihan/${t.id}`);
  tampilUnggah(req, res, t);
}

async function kirim(req, res) {
  const t = await muat(req, res); if (!t) return;
  const balik = (error, status = 400) => tampilUnggah(req, res, t, { error }, status);

  if (req.errUpload) return balik(req.errUpload);
  if (!req.file) return balik('Pilih foto bukti transfer terlebih dahulu.');

  const hasil = await buktiService.proses({ tagihan: t, penghuni: t.penghuni, file: req.file });
  if (hasil.error) return balik(hasil.error, hasil.ocr ? 503 : 400);
  res.redirect(`/tagihan/${t.id}/hasil/${hasil.buktiId}`);
}

async function hasil(req, res) {
  const t = await muat(req, res); if (!t) return;
  if (!UUID.test(req.params.buktiId)) return tidakAda(res);

  const { data: b, error } = await supabase.from('bukti_pembayaran').select('*')
    .eq('id', req.params.buktiId).eq('tagihan_id', t.id).maybeSingle();
  if (error) throw error;
  if (!b || b.status === 'memproses') return tidakAda(res);

  const k = await konteks(t);
  const tampil = TAMPIL[b.status] || TAMPIL.ditolak;
  res.render('pages/tagihan/hasil', {
    title: tampil.judul, ...k, b, tampil, petunjuk: PETUNJUK[b.status] || null,
    bacaNominal: ['disetujui', 'nominal_beda', 'ditolak'].includes(b.status)
  });
}

// dipakai view riwayat upaya
function tanggalUpaya(ts) { return fmt.tanggalPendek(fmt.tanggalWIB(ts)); }

module.exports = { detail, formUnggah, kirim, hasil, tanggalUpaya };