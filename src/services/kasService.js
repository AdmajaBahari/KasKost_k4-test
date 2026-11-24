const supabase = require('../config/supabase');
const fmt = require('../utils/format');

// Kas ditentukan oleh kategori, bukan oleh siapa yang mencatat
const KATEGORI = {
  gas: { label: 'Gas', kelompok: 'Kebutuhan kos', kas: 'kos' },
  token_listrik: { label: 'Token listrik', kelompok: 'Kebutuhan kos', kas: 'kos' },
  maintenance: { label: 'Maintenance', kelompok: 'Maintenance', kas: 'pemilik' },
  kebersihan: { label: 'Kebersihan', kelompok: 'Kebersihan', kas: 'pemilik' }
};
const BOLEH = {
  pemilik: ['gas', 'token_listrik', 'maintenance', 'kebersihan'],
  admin: ['gas', 'token_listrik']
};
const KAS_LABEL = { kos: 'Kas Kos', pemilik: 'Kas Pemilik' };
const NAMA_PERAN = { pemilik: 'Pemilik', admin: 'Admin' };
const MAKS_NOMINAL = 100000000;

const jumlah = (rows, kunci) => rows.reduce((s, r) => s + r[kunci], 0);
const labelJenis = (j) => (j === 'DENDA' ? 'Denda' : `Kelompok ${j}`);
const akhirBulan = (periode) => {
  const [y, m] = periode.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

function opsiUntuk(peran) {
  return (BOLEH[peran] || []).map((k) => ({
    nilai: k, label: KATEGORI[k].label, kas: KATEGORI[k].kas, kasLabel: KAS_LABEL[KATEGORI[k].kas]
  }));
}

// Semua transaksi: pemasukan (bukti disetujui) dan pengeluaran
async function semuaTransaksi() {
  const { data: bk, error: e1 } = await supabase.from('bukti_pembayaran')
    .select('id, created_at, diverifikasi_at, tagihan:tagihan_id(jenis, total), ' +
      'penghuni:penghuni_id(kamar:kamar_id(nama), user:user_id(email)), verifier:diverifikasi_oleh(role)')
    .eq('status', 'disetujui');
  if (e1) throw e1;

  const masuk = (bk || []).filter((b) => b.tagihan).map((b) => {
    const ph = b.penghuni;
    const asal = ph && ph.kamar ? ph.kamar.nama : (ph && ph.user ? ph.user.email : '-');
    const waktu = b.diverifikasi_at || b.created_at;
    return {
      id: 'm' + b.id, tanggal: fmt.tanggalWIB(waktu), waktu,
      ket: `${asal} · ${labelJenis(b.tagihan.jenis)}`, kategori: 'Pembayaran',
      kas: b.tagihan.jenis === 'B' ? 'kos' : 'pemilik',
      masuk: b.tagihan.total, keluar: 0,
      oleh: b.verifier ? (NAMA_PERAN[b.verifier.role] || 'Sistem') : 'Sistem', catatan: null
    };
  });

  const { data: pg, error: e2 } = await supabase.from('pengeluaran')
    .select('id, tanggal, kategori, nominal, catatan, kas, created_at, pencatat:dicatat_oleh(role)');
  if (e2) throw e2;

  const keluar = (pg || []).map((p) => ({
    id: 'k' + p.id, tanggal: p.tanggal, waktu: p.created_at,
    ket: KATEGORI[p.kategori] ? KATEGORI[p.kategori].label : p.kategori,
    kategori: KATEGORI[p.kategori] ? KATEGORI[p.kategori].kelompok : '-',
    kas: p.kas, masuk: 0, keluar: p.nominal,
    oleh: p.pencatat ? (NAMA_PERAN[p.pencatat.role] || '-') : '-', catatan: p.catatan
  }));

  return masuk.concat(keluar).sort((a, b) => (a.tanggal === b.tanggal ? (a.waktu < b.waktu ? 1 : -1) : (a.tanggal < b.tanggal ? 1 : -1)));
}

async function laporan({ peran, bulan, kas, jenis }) {
  const semua = await semuaTransaksi();
  const periodeIni = fmt.hariIniWIB().slice(0, 8) + '01';
  const lingkup = peran === 'admin' ? 'kos' : (['kos', 'pemilik'].includes(kas) ? kas : 'semua');
  const filterJenis = ['masuk', 'keluar'].includes(jenis) ? jenis : '';

  const dalam = semua.filter((t) => lingkup === 'semua' || t.kas === lingkup);
  const periodeAda = [...new Set(dalam.map((t) => t.tanggal.slice(0, 8) + '01').concat([periodeIni]))].sort().reverse();
  const periode = periodeAda.includes(bulan) ? bulan : periodeIni;
  const akhir = akhirBulan(periode);

  const bulanIni = dalam.filter((t) => t.tanggal.slice(0, 8) + '01' === periode);
  // saldo kumulatif sampai akhir bulan terpilih
  const saldoKe = (k) => semua.filter((t) => t.kas === k && t.tanggal <= akhir).reduce((s, t) => s + t.masuk - t.keluar, 0);
  const saldo = { pemilik: saldoKe('pemilik'), kos: saldoKe('kos') };

  let baris = bulanIni;
  if (filterJenis === 'masuk') baris = bulanIni.filter((t) => t.masuk > 0);
  if (filterJenis === 'keluar') baris = bulanIni.filter((t) => t.keluar > 0);

  return {
    periode, lingkup, jenis: filterJenis,
    daftarPeriode: periodeAda.map((p) => ({ nilai: p, label: fmt.bulanTahun(p) })),
    totalMasuk: jumlah(bulanIni, 'masuk'),
    totalKeluar: jumlah(bulanIni, 'keluar'),
    saldo,
    saldoTotal: lingkup === 'semua' ? saldo.pemilik + saldo.kos : saldo[lingkup],
    baris, jumlahBulan: bulanIni.length
  };
}

async function daftarTerakhir(peran) {
  let q = supabase.from('pengeluaran')
    .select('id, tanggal, kategori, nominal, kas, pencatat:dicatat_oleh(role)')
    .order('created_at', { ascending: false }).limit(5);
  if (peran === 'admin') q = q.eq('kas', 'kos');
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map((p) => ({
    tanggal: p.tanggal,
    kategori: KATEGORI[p.kategori] ? KATEGORI[p.kategori].label : p.kategori,
    nominal: p.nominal,
    oleh: p.pencatat ? (NAMA_PERAN[p.pencatat.role] || '-') : '-'
  }));
}

function bacaNominal(mentah) {
  const s = String(mentah || '').trim().replace(/^rp\.?\s*/i, '');
  if (!s) return { error: 'Nominal wajib diisi.' };
  if (!/^\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) {
    return { error: 'Isi nominal dengan angka saja, contoh 150000 atau 150.000.' };
  }
  const n = parseInt(s.replace(/\./g, ''), 10);
  if (n <= 0) return { error: 'Nominal harus lebih dari 0.' };
  if (n > MAKS_NOMINAL) return { error: 'Nominal terlalu besar (maksimal Rp 100.000.000).' };
  return { n };
}

async function catatPengeluaran({ user, tanggal, kategori, nominal, catatan }) {
  const gagal = (field, pesan) => ({ ok: false, error: { field, pesan } });

  if (!(BOLEH[user.role] || []).includes(kategori)) return gagal('kategori', 'Pilih kategori yang tersedia.');

  const hariIni = fmt.hariIniWIB();
  const tanggalValid = /^\d{4}-\d{2}-\d{2}$/.test(tanggal) && new Date(tanggal + 'T00:00:00Z').toISOString().slice(0, 10) === tanggal;
  if (!tanggalValid) return gagal('tanggal', 'Tanggal belum benar.');
  if (tanggal > hariIni) return gagal('tanggal', 'Tanggal tidak boleh di masa depan.');
  if (tanggal < fmt.geserHari(hariIni, -365)) return gagal('tanggal', 'Tanggal terlalu lama (maksimal 1 tahun ke belakang).');

  const nom = bacaNominal(nominal);
  if (nom.error) return gagal('nominal', nom.error);

  const cat = String(catatan || '').trim();
  if (cat.length > 200) return gagal('catatan', 'Catatan maksimal 200 karakter.');

  // cegah kiriman ganda (klik dua kali)
  const { data: ada } = await supabase.from('pengeluaran').select('id')
    .eq('dicatat_oleh', user.id).eq('kategori', kategori).eq('nominal', nom.n).eq('tanggal', tanggal)
    .gte('created_at', new Date(Date.now() - 10000).toISOString()).limit(1);
  if (ada && ada.length) return { ok: true };

  const { error } = await supabase.from('pengeluaran').insert({
    tanggal, kategori, nominal: nom.n, catatan: cat || null,
    kas: KATEGORI[kategori].kas, dicatat_oleh: user.id
  });
  if (error) throw error;
  return { ok: true };
}

module.exports = { opsiUntuk, laporan, daftarTerakhir, catatPengeluaran };