const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const tagihanService = require('./tagihanService');
const buktiService = require('./buktiService');
const pengelolaService = require('./pengelolaService');
const kasService = require('./kasService');
const antreanService = require('./antreanService');
const gemini = require('./geminiService');

const STATUS_BELUM = ['belum_dibayar', 'telat', 'ditolak'];
const labelJenis = (j) => (j === 'DENDA' ? 'Denda' : `Kelompok ${j}`);

// ---------- pembatas laju (dalam memori): 15 pertanyaan per 10 menit, jeda 2 detik ----------
const laju = new Map();
function izinLaju(userId) {
  const sekarang = Date.now();
  const arr = (laju.get(userId) || []).filter((t) => sekarang - t < 10 * 60 * 1000);
  if ((arr.length && sekarang - arr[arr.length - 1] < 2000) || arr.length >= 15) return false;
  arr.push(sekarang);
  laju.set(userId, arr);
  return true;
}

// ---------- data penghuni ----------
async function konteksPenghuni(user) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif, kamar:kamar_id(nama)').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!ph || !ph.aktif) return null;
  const hariIni = fmt.hariIniWIB();
  const periodeIni = hariIni.slice(0, 8) + '01';
  return {
    id: ph.id, kamar: ph.kamar ? ph.kamar.nama : '-', hariIni, periodeIni,
    periodeLalu: fmt.geserHari(periodeIni, -1).slice(0, 8) + '01', cache: {}
  };
}

async function ambilPeriode(phId, periode) {
  const { data: tg, error } = await supabase.from('tagihan')
    .select('id, jenis, total, status, batas_bayar, tagihan_item(label, nominal)')
    .eq('penghuni_id', phId).eq('periode', periode);
  if (error) throw error;

  const ids = (tg || []).map((t) => t.id);
  const dibayar = {};
  if (ids.length) {
    const { data: bk } = await supabase.from('bukti_pembayaran')
      .select('tagihan_id, tanggal_pada_bukti, diverifikasi_at, created_at')
      .in('tagihan_id', ids).eq('status', 'disetujui').order('created_at', { ascending: false });
    (bk || []).forEach((b) => {
      if (!dibayar[b.tagihan_id]) dibayar[b.tagihan_id] = b.tanggal_pada_bukti || fmt.tanggalWIB(b.diverifikasi_at || b.created_at);
    });
  }
  const item = {};
  (tg || []).forEach((t) => { item[t.jenis] = { ...t, dibayar: dibayar[t.id] || null }; });
  return { periode, bulan: fmt.bulanTahun(periode), item, ada: (tg || []).length > 0, total: (tg || []).reduce((s, t) => s + t.total, 0) };
}

async function periodeIni(c) {
  if (!c.cache.ini) {
    await tagihanService.ringkasanBulanIni(c.id); // memastikan tagihan, telat, dan denda terbaru
    c.cache.ini = await ambilPeriode(c.id, c.periodeIni);
  }
  return c.cache.ini;
}
async function periodeLalu(c) {
  if (!c.cache.lalu) c.cache.lalu = await ambilPeriode(c.id, c.periodeLalu);
  return c.cache.lalu;
}

function barisJenis(p) {
  const baris = [];
  ['A', 'B', 'DENDA'].forEach((j) => {
    const t = p.item[j];
    if (!t) return;
    baris.push({
      label: labelJenis(j) + (t.dibayar ? ` (dibayar ${fmt.tanggalDM(t.dibayar)})` : ''),
      nilai: fmt.rupiah(t.total), status: t.status
    });
  });
  if (!p.item.DENDA) baris.push({ label: 'Tanpa denda.' });
  return baris;
}

const ringkasan = (p, kamar) => ({
  judul: `Rangkuman ${p.bulan} untuk ${kamar}`,
  baris: p.ada ? [{ label: 'Total tagihan', nilai: fmt.rupiah(p.total) }].concat(barisJenis(p)) : [{ label: 'Belum ada tagihan pada periode ini.' }]
});

const ARTI_STATUS = [
  { label: 'Belum ada bukti diterima untuk tagihan ini.', status: 'belum_dibayar' },
  { label: 'Bukti sedang diperiksa pengelola.', status: 'menunggu_verifikasi' },
  { label: 'Pembayaran sudah diterima.', status: 'lunas' },
  { label: 'Sudah lewat batas bayar dan belum lunas.', status: 'telat' },
  { label: 'Bukti terakhir ditolak; kamu bisa mengunggah ulang selama percobaan masih ada.', status: 'ditolak' }
];

const PENGHUNI = [
  { id: 'ringkasan_bulan_ini', teks: 'Buatkan rangkuman bulan ini', bangun: async (c) => ringkasan(await periodeIni(c), c.kamar) },
  { id: 'ringkasan_bulan_lalu', teks: 'Buatkan rangkuman bulan lalu', bangun: async (c) => ringkasan(await periodeLalu(c), c.kamar) },
  {
    id: 'status_bulan_ini', teks: 'Bagaimana status pembayaran bulan ini?',
    bangun: async (c) => {
      const p = await periodeIni(c);
      return { judul: `Status pembayaran ${p.bulan}`, baris: p.ada ? barisJenis(p) : [{ label: 'Belum ada tagihan pada periode ini.' }] };
    }
  },
  {
    id: 'total_sekarang', teks: 'Berapa total yang harus saya bayar sekarang?',
    bangun: async (c) => {
      const p = await periodeIni(c);
      const belum = ['A', 'B', 'DENDA'].map((j) => ({ j, t: p.item[j] })).filter((x) => x.t && STATUS_BELUM.includes(x.t.status));
      if (!belum.length) return { judul: 'Yang harus dibayar sekarang', baris: [{ label: 'Tidak ada tagihan yang harus dibayar sekarang.' }] };
      const jumlah = belum.reduce((s, x) => s + x.t.total, 0);
      return {
        judul: 'Yang harus dibayar sekarang',
        baris: belum.map((x) => ({ label: labelJenis(x.j), nilai: fmt.rupiah(x.t.total), status: x.t.status })).concat([{ label: 'Total', nilai: fmt.rupiah(jumlah) }])
      };
    }
  },
  {
    id: 'kenapa_denda', teks: 'Kenapa ada denda di tagihan saya?',
    bangun: async (c) => {
      const p = await periodeIni(c);
      const d = p.item.DENDA;
      if (!d) return { judul: 'Denda', baris: [{ label: 'Tidak ada denda pada bulan ini.' }] };
      return {
        judul: `Denda ${p.bulan}`,
        baris: (d.tagihan_item || []).map((i) => ({ label: i.label, nilai: fmt.rupiah(i.nominal) }))
          .concat([{ label: 'Total denda', nilai: fmt.rupiah(d.total), status: d.status }])
      };
    }
  },
  {
    id: 'batas_bayar', teks: 'Kapan batas bayar bulan ini?',
    bangun: async (c) => {
      const p = await periodeIni(c);
      const t = p.item.A || p.item.B;
      if (!t || !t.batas_bayar) return { judul: 'Batas bayar', baris: [{ label: 'Belum ada tagihan dengan batas bayar bulan ini.' }] };
      const sisa = fmt.selisihHari(c.hariIni, t.batas_bayar);
      return {
        judul: `Batas bayar ${p.bulan}`,
        baris: [
          { label: 'Batas bayar', nilai: fmt.tanggalPanjang(t.batas_bayar) },
          { label: 'Sisa waktu', nilai: sisa > 0 ? `${sisa} hari lagi` : (sisa === 0 ? 'Hari ini' : `Terlambat ${-sisa} hari`) }
        ]
      };
    }
  },
  {
    id: 'cara_bayar', teks: 'Bagaimana cara membayar tagihan?',
    bangun: async () => {
      const { data, error } = await supabase.from('rekening_tujuan').select('*').in('jenis', ['A', 'B', 'DENDA']);
      if (error) throw error;
      return {
        judul: 'Rekening tujuan pembayaran',
        baris: (data || []).sort((a, b) => a.jenis.localeCompare(b.jenis))
          .map((r) => ({ label: labelJenis(r.jenis), nilai: `${r.bank} ${r.nomor} a.n. ${r.atas_nama}` }))
      };
    }
  },
  {
    id: 'sisa_percobaan', teks: 'Berapa sisa percobaan unggah bukti saya?',
    bangun: async (c) => {
      const p = await periodeIni(c);
      const belum = ['A', 'B', 'DENDA'].map((j) => ({ j, t: p.item[j] })).filter((x) => x.t && STATUS_BELUM.includes(x.t.status));
      if (!belum.length) return { judul: 'Sisa percobaan', baris: [{ label: 'Tidak ada tagihan yang menunggu bukti.' }] };
      const baris = [];
      for (const x of belum) {
        const i = await buktiService.infoPercobaan(x.t.id);
        baris.push({ label: labelJenis(x.j), nilai: `${i.sisa} dari ${i.maks}` });
      }
      return { judul: 'Sisa percobaan unggah bukti', baris };
    }
  },
  { id: 'arti_status', teks: 'Apa arti setiap status tagihan?', bangun: async () => ({ judul: 'Arti status tagihan', baris: ARTI_STATUS }) }
];

// ---------- data pemilik dan admin ----------
const PEMILIK = [
  {
    id: 'ringkasan', teks: 'Buatkan rangkuman bulan ini',
    bangun: async () => {
      const d = await pengelolaService.berandaPemilik();
      const k = await kasService.laporan({ peran: 'pemilik', bulan: '', kas: '', jenis: '' });
      return {
        judul: `Rangkuman ${d.bulan}`,
        baris: [
          { label: 'Tagihan lunas', nilai: `${d.lunas} dari ${d.totalKamar} kamar` },
          { label: 'Bukti menunggu verifikasi', nilai: `${d.antrean} bukti` },
          { label: 'Pendaftar baru', nilai: `${d.pendaftar} orang` },
          { label: 'Total pemasukan', nilai: fmt.rupiah(k.totalMasuk) },
          { label: 'Total pengeluaran', nilai: fmt.rupiah(k.totalKeluar) },
          { label: 'Saldo total kas', nilai: fmt.rupiah(k.saldoTotal) }
        ]
      };
    }
  },
  {
    id: 'belum_lunas', teks: 'Kamar mana yang belum lunas bulan ini?',
    bangun: async () => {
      const d = await pengelolaService.berandaPemilik();
      const belum = d.baris.filter((b) => b.status !== 'lunas');
      if (!belum.length) return { judul: `Belum lunas ${d.bulan}`, baris: [{ label: 'Semua kamar sudah lunas.' }] };
      const baris = belum.slice(0, 12).map((b) => ({ label: b.kamar, status: b.status }));
      if (belum.length > 12) baris.push({ label: `dan ${belum.length - 12} kamar lainnya` });
      return { judul: `Belum lunas ${d.bulan}`, baris };
    }
  },
  {
    id: 'antrean', teks: 'Berapa bukti yang menunggu verifikasi?',
    bangun: async () => {
      const a = await antreanService.daftarAntrean('pemilik');
      const per = { A: 0, B: 0, DENDA: 0 };
      a.forEach((b) => { per[b.tagihan.jenis] += 1; });
      return {
        judul: 'Antrean verifikasi',
        baris: [
          { label: 'Menunggu verifikasi', nilai: `${a.length} bukti` },
          { label: 'Kelompok A', nilai: `${per.A} bukti` },
          { label: 'Kelompok B', nilai: `${per.B} bukti` },
          { label: 'Denda', nilai: `${per.DENDA} bukti` }
        ]
      };
    }
  },
  {
    id: 'saldo_kas', teks: 'Berapa saldo kas saat ini?',
    bangun: async () => {
      const k = await kasService.laporan({ peran: 'pemilik', bulan: '', kas: '', jenis: '' });
      return {
        judul: 'Saldo kas',
        baris: [
          { label: 'Kas Pemilik', nilai: fmt.rupiah(k.saldo.pemilik) },
          { label: 'Kas Kos', nilai: fmt.rupiah(k.saldo.kos) },
          { label: 'Saldo total', nilai: fmt.rupiah(k.saldoTotal) }
        ]
      };
    }
  }
];

const ADMIN = [
  {
    id: 'ringkasan_kas_kos', teks: 'Buatkan rangkuman Kas Kos bulan ini',
    bangun: async () => {
      const k = await kasService.laporan({ peran: 'admin', bulan: '', kas: '', jenis: '' });
      return {
        judul: `Rangkuman Kas Kos ${fmt.bulanTahun(k.periode)}`,
        baris: [
          { label: 'Total pemasukan', nilai: fmt.rupiah(k.totalMasuk) },
          { label: 'Total pengeluaran', nilai: fmt.rupiah(k.totalKeluar) },
          { label: 'Saldo Kas Kos', nilai: fmt.rupiah(k.saldoTotal) }
        ]
      };
    }
  },
  {
    id: 'antrean_b', teks: 'Berapa bukti Kelompok B yang menunggu verifikasi?',
    bangun: async () => {
      const a = await antreanService.daftarAntrean('admin');
      if (!a.length) return { judul: 'Antrean verifikasi', baris: [{ label: 'Tidak ada bukti yang menunggu verifikasi.' }] };
      return {
        judul: 'Antrean verifikasi Kelompok B',
        baris: [{ label: 'Menunggu verifikasi', nilai: `${a.length} bukti` }].concat(
          a.slice(0, 8).map((b) => ({ label: b.penghuni && b.penghuni.kamar ? b.penghuni.kamar.nama : '-', nilai: fmt.rupiah(b.tagihan.total), status: 'menunggu_verifikasi' }))
        )
      };
    }
  },
  {
    id: 'pengeluaran_bulan', teks: 'Berapa pengeluaran Kas Kos bulan ini?',
    bangun: async () => {
      const k = await kasService.laporan({ peran: 'admin', bulan: '', kas: '', jenis: 'keluar' });
      const per = {};
      k.baris.forEach((r) => { per[r.ket] = (per[r.ket] || 0) + r.keluar; });
      const baris = Object.keys(per).map((n) => ({ label: n, nilai: fmt.rupiah(per[n]) }));
      if (!baris.length) return { judul: `Pengeluaran Kas Kos ${fmt.bulanTahun(k.periode)}`, baris: [{ label: 'Belum ada pengeluaran bulan ini.' }] };
      return { judul: `Pengeluaran Kas Kos ${fmt.bulanTahun(k.periode)}`, baris: baris.concat([{ label: 'Total', nilai: fmt.rupiah(k.totalKeluar) }]) };
    }
  }
];

const PERTANYAAN = { penghuni: PENGHUNI, pemilik: PEMILIK, admin: ADMIN };

function daftarPertanyaan(peran) {
  return (PERTANYAAN[peran] || []).map((p) => ({ id: p.id, teks: p.teks }));
}

async function aturan() {
  const { data } = await supabase.from('pengaturan').select('kunci, nilai');
  const p = Object.fromEntries((data || []).map((r) => [r.kunci, r.nilai]));
  return {
    batas_bayar_tanggal: p.batas_bayar_tanggal || '10',
    persen_denda: p.persen_denda || '10',
    maks_percobaan_unggah: p.maks_percobaan || '5',
    pembayaran: 'Nominal transfer harus sama persis dengan tagihan; pembayaran sebagian tidak diterima.',
    denda: 'Denda dikenakan sebagai persentase dari tagihan yang melewati batas bayar.',
    percobaan: 'Bukti yang ditolak mengurangi sisa percobaan; setelah habis, bukti diperiksa pengelola.'
  };
}

// Hasil: { ok: true, kartu } atau { ok: false, jenis, pesan }
async function jawab(user, id) {
  const p = (PERTANYAAN[user.role] || []).find((x) => x.id === id);
  if (!p) return { ok: false, jenis: 'tidak_valid', pesan: 'Pertanyaan tidak dikenal.' };
  if (!izinLaju(user.id)) return { ok: false, jenis: 'batas', pesan: 'Tunggu sebentar lalu coba lagi.' };

  let kartu;
  try {
    let konteks = {};
    if (user.role === 'penghuni') {
      konteks = await konteksPenghuni(user);
      if (!konteks) return { ok: false, jenis: 'tidak_ada', pesan: 'Akunmu belum terhubung ke kamar yang aktif.' };
    }
    kartu = await p.bangun(konteks);
  } catch (e) {
    console.error('[ASISTEN] data gagal:', e.message);
    return { ok: false, jenis: 'gagal' };
  }

  // hanya label, nominal, dan status yang dikirim ke Gemini
  const fakta = {
    pertanyaan: p.teks,
    judul: kartu.judul,
    baris: kartu.baris.map((b) => ({ label: b.label, nilai: b.nilai || null, status: b.status ? fmt.STATUS[b.status].label : null })),
    aturan: await aturan()
  };

  let catatan = null;
  try {
    catatan = await gemini.catatan(fakta);
  } catch (e) {
    return { ok: false, jenis: 'gagal' };
  }
  return { ok: true, kartu: { ...kartu, catatan } };
}

module.exports = { daftarPertanyaan, jawab };