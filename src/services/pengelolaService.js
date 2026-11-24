const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const tagihanService = require('./tagihanService');

const URUTAN = ['telat', 'ditolak', 'belum_dibayar', 'menunggu_verifikasi', 'lunas'];
const jumlah = (rows) => (rows || []).reduce((s, r) => s + (r.nominal || 0), 0);

async function berandaPemilik() {
  const periode = fmt.hariIniWIB().slice(0, 8) + '01';

  const { data: kamar } = await supabase.from('kamar').select('id, status');
  const totalKamar = (kamar || []).filter((k) => k.status !== 'nonaktif').length;

  const { data: phs, error } = await supabase.from('penghuni')
    .select('id, kamar:kamar_id(nama), user:user_id(nama_lengkap, email)').eq('aktif', true);
  if (error) throw error;

  // pastikan tagihan bulan ini ada untuk semua penghuni aktif (sementara, sampai ada job bulanan)
  await tagihanService.jalankanJob();

  const { data: tg } = await supabase.from('tagihan')
    .select('penghuni_id, jenis, total, status').eq('periode', periode);
  const per = {};
  (tg || []).forEach((t) => { (per[t.penghuni_id] = per[t.penghuni_id] || {})[t.jenis] = t; });

  const baris = (phs || []).map((ph) => {
    const x = per[ph.id] || {};
    const ada = Object.values(x);
    return {
      kamar: ph.kamar ? ph.kamar.nama : '-',
      nama: ph.user ? (ph.user.nama_lengkap || ph.user.email) : '-',
      A: x.A || null, B: x.B || null, DENDA: x.DENDA || null,
      status: URUTAN.find((s) => ada.some((t) => t.status === s)) || 'belum_dibayar'
    };
  }).sort((a, b) => a.kamar.localeCompare(b.kamar, 'id', { numeric: true }));

  const { count: antrean } = await supabase.from('bukti_pembayaran')
    .select('id', { count: 'exact', head: true }).eq('status', 'diperiksa_pengelola');
  const { count: pendaftar } = await supabase.from('users')
    .select('id', { count: 'exact', head: true }).eq('role', 'penghuni').eq('status_akun', 'menunggu_persetujuan');

  const { data: masuk } = await supabase.from('v_pemasukan_kas').select('nominal').eq('kas', 'pemilik');
  const { data: keluar } = await supabase.from('pengeluaran').select('nominal').eq('kas', 'pemilik');

  return {
    bulan: fmt.bulanTahun(periode),
    totalKamar,
    lunas: baris.filter((b) => b.status === 'lunas').length,
    antrean: antrean || 0,
    pendaftar: pendaftar || 0,
    saldo: jumlah(masuk) - jumlah(keluar),
    baris
  };
}

async function daftarPendaftar() {
  const { data, error } = await supabase.from('users')
    .select('id, email, created_at, penghuni(kamar:kamar_id(nama))')
    .eq('role', 'penghuni').eq('status_akun', 'menunggu_persetujuan')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map((u) => {
    const ph = Array.isArray(u.penghuni) ? u.penghuni[0] : u.penghuni;
    return { id: u.id, email: u.email, tanggal: fmt.tanggalWIB(u.created_at), kamar: ph && ph.kamar ? ph.kamar.nama : '-' };
  });
}

module.exports = { berandaPemilik, daftarPendaftar };