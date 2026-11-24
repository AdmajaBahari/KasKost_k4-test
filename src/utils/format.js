const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

const STATUS = {
  belum_dibayar: { label: 'Belum Dibayar', ikon: 'circle' },
  menunggu_verifikasi: { label: 'Menunggu Verifikasi', ikon: 'clock' },
  lunas: { label: 'Lunas', ikon: 'check' },
  telat: { label: 'Telat', ikon: 'alert' },
  ditolak: { label: 'Ditolak', ikon: 'x' }
};

// Label hasil per upaya bukti (untuk riwayat upaya)
const HASIL_BUKTI = {
  disetujui: 'Diterima',
  nominal_beda: 'Ditolak',
  buram: 'Ditolak',
  duplikat: 'Ditolak',
  ditolak: 'Ditolak',
  diperiksa_pengelola: 'Diperiksa pengelola',
  cocok: 'Cocok',
  memproses: 'Diproses'
};

const pecah = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };

// Tanggal hari ini (YYYY-MM-DD) menurut WIB
function hariIniWIB() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

// Tanggal (YYYY-MM-DD, WIB) dari timestamp
function tanggalWIB(ts) {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function geserHari(s, n) {
  const { y, m, d } = pecah(s);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function rupiah(n) {
  return 'Rp ' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function tanggalPendek(s) {
  if (!s) return '-';
  const { y, m, d } = pecah(s);
  return `${d} ${BULAN_PENDEK[m - 1]} ${y}`;
}

function tanggalPanjang(s) {
  if (!s) return '-';
  const { y, m, d } = pecah(s);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

function tanggalDM(s) {
  const { m, d } = pecah(s);
  return `${d} ${BULAN_PENDEK[m - 1]}`;
}

function bulanTahun(s) {
  const { y, m } = pecah(s);
  return `${BULAN[m - 1]} ${y}`;
}

function selisihHari(dari, ke) {
  const a = pecah(dari), b = pecah(ke);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

function teksBatas(sisa, batas) {
  const t = tanggalDM(batas);
  if (sisa > 0) return `Batas bayar ${sisa} hari lagi (${t})`;
  if (sisa === 0) return `Batas bayar hari ini (${t})`;
  return `Lewat batas bayar ${-sisa} hari (${t})`;
}

module.exports = {
  STATUS, HASIL_BUKTI, hariIniWIB, tanggalWIB, geserHari, rupiah,
  tanggalPendek, tanggalPanjang, tanggalDM, bulanTahun, selisihHari, teksBatas
};