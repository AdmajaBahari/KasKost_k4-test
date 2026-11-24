const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const tagihanService = require('./tagihanService');

async function semuaTagihan({ bulan, status, id }) {
  await tagihanService.jalankanJob();

  const periodeIni = fmt.hariIniWIB().slice(0, 8) + '01';
  const { data: semua, error: eS } = await supabase.from('tagihan').select('periode');
  if (eS) throw eS;
  const nilai = [...new Set((semua || []).map((t) => t.periode).concat([periodeIni]))].sort().reverse();
  const periode = nilai.includes(bulan) ? bulan : periodeIni;

  const { data: tg, error } = await supabase.from('tagihan')
    .select('id, penghuni_id, jenis, total, status, penghuni:penghuni_id(id, kamar:kamar_id(nama), user:user_id(nama_lengkap, email))')
    .eq('periode', periode);
  if (error) throw error;

  // bukti yang disetujui (untuk "Dibayar ..." dan "Lihat Bukti")
  const ids = (tg || []).map((t) => t.id);
  const buktiPer = {};
  if (ids.length) {
    const { data: bk } = await supabase.from('bukti_pembayaran')
      .select('id, tagihan_id, tanggal_pada_bukti, diverifikasi_at, created_at')
      .in('tagihan_id', ids).eq('status', 'disetujui').order('created_at', { ascending: false });
    (bk || []).forEach((b) => {
      if (buktiPer[b.tagihan_id]) return;
      buktiPer[b.tagihan_id] = { id: b.id, tanggal: b.tanggal_pada_bukti || fmt.tanggalWIB(b.diverifikasi_at || b.created_at) };
    });
  }

  const per = {};
  (tg || []).forEach((t) => {
    const ph = t.penghuni;
    if (!ph) return;
    const x = per[ph.id] = per[ph.id] || {
      id: ph.id,
      kamar: ph.kamar ? ph.kamar.nama : '-',
      nama: ph.user ? (ph.user.nama_lengkap || ph.user.email) : '-',
      A: null, B: null, DENDA: null
    };
    x[t.jenis] = { id: t.id, total: t.total, status: t.status, bukti: buktiPer[t.id] || null };
  });

  const semuaBaris = Object.values(per).map((x) => {
    const ada = [x.A, x.B, x.DENDA].filter(Boolean);
    x.status = tagihanService.URUTAN_BAHAYA.find((s) => ada.some((t) => t.status === s)) || 'belum_dibayar';
    return x;
  }).sort((a, b) => a.kamar.localeCompare(b.kamar, 'id', { numeric: true }));

  const baris = status ? semuaBaris.filter((r) => r.status === status) : semuaBaris;
  const terpilih = baris.find((r) => r.id === id) || baris[0] || null;

  return {
    periode, status,
    bulan: fmt.bulanTahun(periode),
    daftarPeriode: nilai.map((p) => ({ nilai: p, label: fmt.bulanTahun(p) })),
    baris, terpilih, total: semuaBaris.length
  };
}

module.exports = { semuaTagihan };