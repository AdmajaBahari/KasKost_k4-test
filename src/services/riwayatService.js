const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const tagihanService = require('./tagihanService');

async function riwayat(userId, tahunDiminta, periodeDiminta) {
  const { data: ph, error: eP } = await supabase.from('penghuni').select('id').eq('user_id', userId).maybeSingle();
  if (eP) throw eP;
  if (!ph) return { adaData: false, daftarTahun: [], tahun: null, baris: [], terpilih: null };

  const { data: tg, error } = await supabase.from('tagihan')
    .select('id, jenis, total, status, periode').eq('penghuni_id', ph.id).order('periode', { ascending: false });
  if (error) throw error;

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
    const x = per[t.periode] = per[t.periode] || { periode: t.periode, bulan: fmt.bulanTahun(t.periode), A: null, B: null, DENDA: null };
    x[t.jenis] = { id: t.id, total: t.total, status: t.status, bukti: buktiPer[t.id] || null };
  });

  const semua = Object.values(per).map((x) => {
    const ada = [x.A, x.B, x.DENDA].filter(Boolean);
    x.total = ada.reduce((s, t) => s + t.total, 0);
    x.status = tagihanService.URUTAN_BAHAYA.find((s) => ada.some((t) => t.status === s)) || 'belum_dibayar';
    return x;
  }).sort((a, b) => (a.periode < b.periode ? 1 : -1));

  const daftarTahun = [...new Set(semua.map((x) => x.periode.slice(0, 4)))];
  const tahunIni = fmt.hariIniWIB().slice(0, 4);
  const tahun = daftarTahun.includes(tahunDiminta) ? tahunDiminta : (daftarTahun.includes(tahunIni) ? tahunIni : daftarTahun[0] || null);
  const baris = semua.filter((x) => x.periode.startsWith(tahun || '-'));

  return {
    adaData: semua.length > 0, daftarTahun, tahun, baris,
    terpilih: baris.find((x) => x.periode === periodeDiminta) || null
  };
}

module.exports = { riwayat };