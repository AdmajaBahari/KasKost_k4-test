const supabase = require('../config/supabase');
const fmt = require('../utils/format');

const BUCKET = 'bukti-pembayaran';
const SELECT = 'id, created_at, status, alasan_penolakan, nominal_terbaca, tanggal_pada_bukti, keyakinan, nama_pengirim, file_path, tagihan_id, ' +
  'tagihan:tagihan_id(id, jenis, total, periode, batas_bayar, status), ' +
  'penghuni:penghuni_id(id, user_id, kamar:kamar_id(nama), user:user_id(email, nama_lengkap))';

// Pemilik melihat semua jenis; Admin hanya Kelompok B
function bolehLihat(peran, jenis) {
  return peran === 'pemilik' || (peran === 'admin' && jenis === 'B');
}

async function daftarAntrean(peran) {
  const { data, error } = await supabase.from('bukti_pembayaran').select(SELECT)
    .eq('status', 'diperiksa_pengelola').order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).filter((b) => b.tagihan && bolehLihat(peran, b.tagihan.jenis));
}

async function riwayatPenolakan(tagihanId) {
  const { data, error } = await supabase.from('bukti_pembayaran')
    .select('id, status, alasan_penolakan, nominal_terbaca, created_at')
    .eq('tagihan_id', tagihanId)
    .in('status', ['nominal_beda', 'buram', 'duplikat', 'ditolak', 'diperiksa_pengelola'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

// Tautan foto sementara (5 menit); bucket tetap privat
async function urlFoto(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
}

async function beritahu(userId, judul, isi) {
  await supabase.from('notifikasi').insert({ user_id: userId, judul, isi });
}

async function putuskan({ buktiId, pengelola, setuju, alasan }) {
  const { data: b, error } = await supabase.from('bukti_pembayaran').select(SELECT).eq('id', buktiId).maybeSingle();
  if (error) throw error;
  if (!b || !b.tagihan || !bolehLihat(pengelola.role, b.tagihan.jenis)) return { ok: false };
  if (b.status !== 'diperiksa_pengelola') return { ok: false };

  const sekarang = new Date().toISOString();
  const ubah = setuju
    ? { status: 'disetujui', alasan_penolakan: null, diverifikasi_oleh: pengelola.id, diverifikasi_at: sekarang }
    : { status: 'ditolak', alasan_penolakan: alasan || 'Ditolak oleh pengelola.', diverifikasi_oleh: pengelola.id, diverifikasi_at: sekarang };

  // syarat status di sini mencegah dua pengelola memutuskan bukti yang sama
  const { data: baris, error: e2 } = await supabase.from('bukti_pembayaran').update(ubah)
    .eq('id', buktiId).eq('status', 'diperiksa_pengelola').select('id');
  if (e2) throw e2;
  if (!baris || !baris.length) return { ok: false };

  const t = b.tagihan;
  const userId = b.penghuni.user_id;
  if (setuju) {
    await supabase.from('tagihan').update({ status: 'lunas' }).eq('id', t.id);
    await beritahu(userId, 'Pembayaran diterima', 'Bukti transfer kamu sudah diperiksa dan disetujui. Tagihan dinyatakan lunas.');
  } else {
    const telat = t.batas_bayar && t.batas_bayar < fmt.hariIniWIB();
    await supabase.from('tagihan').update({ status: telat ? 'telat' : 'ditolak' }).eq('id', t.id);
    await beritahu(userId, 'Bukti ditolak pengelola', alasan || 'Bukti kamu ditolak setelah diperiksa pengelola.');
  }
  return { ok: true };
}

module.exports = { daftarAntrean, riwayatPenolakan, urlFoto, putuskan };