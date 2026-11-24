const supabase = require('../config/supabase');
const fmt = require('../utils/format');

// status terburuk lebih dulu, dipakai untuk status gabungan
const URUTAN_BAHAYA = ['telat', 'ditolak', 'belum_dibayar', 'menunggu_verifikasi', 'lunas'];
const BELUM_FINAL = ['belum_dibayar', 'telat', 'ditolak'];

const angka = (v, awal, min, max) => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? awal : Math.min(Math.max(n, min), max);
};

async function ambilPengaturan() {
  const { data, error } = await supabase.from('pengaturan').select('kunci, nilai');
  if (error) throw error;
  const p = Object.fromEntries((data || []).map((r) => [r.kunci, r.nilai]));
  return {
    batas: angka(p.batas_bayar_tanggal, 10, 1, 28),
    persen: angka(p.persen_denda, 10, 0, 100)
  };
}

// Versi terbaru tiap komponen yang sudah berlaku pada tanggal tertentu
async function komponenBerlaku(tanggal) {
  const { data, error } = await supabase
    .from('komponen_tagihan').select('kelompok, nama, nominal, berlaku_mulai').lte('berlaku_mulai', tanggal);
  if (error) throw error;

  const hasil = { A: { item: {} }, B: { item: {} } };
  (data || []).forEach((r) => {
    const g = hasil[r.kelompok];
    const lama = g.item[r.nama];
    if (!lama || r.berlaku_mulai > lama.berlaku_mulai) g.item[r.nama] = r;
  });
  Object.values(hasil).forEach((g) => {
    const arr = Object.values(g.item).sort((a, b) => b.nominal - a.nominal);
    g.item = arr;
    g.total = arr.reduce((s, r) => s + r.nominal, 0);
    g.sejak = arr.reduce((m, r) => (!m || r.berlaku_mulai > m ? r.berlaku_mulai : m), null);
  });
  return hasil;
}

async function buatKonteks() {
  const hariIni = fmt.hariIniWIB();
  const periode = hariIni.slice(0, 8) + '01';
  const { batas, persen } = await ambilPengaturan();
  return {
    hariIni, periode, persen,
    batasBayar: periode.slice(0, 8) + String(batas).padStart(2, '0'),
    komp: await komponenBerlaku(hariIni)
  };
}

// Tagihan Kelompok A dan B bulan berjalan
async function buatTagihan(ph, ctx) {
  // masuk setelah batas bayar: mulai ditagih bulan berikutnya
  if (ph.tanggal_masuk && ph.tanggal_masuk > ctx.batasBayar) return;

  const { data: ada, error: eAda } = await supabase.from('tagihan').select('jenis')
    .eq('penghuni_id', ph.id).eq('periode', ctx.periode).in('jenis', ['A', 'B']);
  if (eAda) throw eAda;
  const punya = new Set((ada || []).map((t) => t.jenis));

  for (const jenis of ['A', 'B']) {
    if (punya.has(jenis) || !ctx.komp[jenis].total) continue;
    const { data: t, error } = await supabase.from('tagihan')
      .insert({ penghuni_id: ph.id, jenis, periode: ctx.periode, total: ctx.komp[jenis].total, batas_bayar: ctx.batasBayar })
      .select('id').single();
    if (error) {
      if (error.code === '23505') continue; // sudah dibuat proses lain
      throw error;
    }
    await supabase.from('tagihan_item').insert(
      ctx.komp[jenis].item.map((r) => ({ tagihan_id: t.id, label: r.nama, nominal: r.nominal }))
    );
  }
}

// Lewat batas bayar dan belum ada bukti diterima -> telat
async function tandaiTelat(ctx, penghuniId) {
  let q = supabase.from('tagihan').update({ status: 'telat' })
    .eq('periode', ctx.periode).in('jenis', ['A', 'B'])
    .in('status', ['belum_dibayar', 'ditolak']).lt('batas_bayar', ctx.hariIni);
  if (penghuniId) q = q.eq('penghuni_id', penghuniId);
  const { error } = await q;
  if (error) throw error;
}

// Denda = persen dari tiap kelompok yang telat, digabung dalam satu tagihan DENDA
async function buatDenda(ctx, penghuniId) {
  if (ctx.persen <= 0) return;

  let q = supabase.from('tagihan').select('penghuni_id, jenis, total')
    .eq('periode', ctx.periode).in('jenis', ['A', 'B']).eq('status', 'telat');
  if (penghuniId) q = q.eq('penghuni_id', penghuniId);
  const { data: telat, error } = await q;
  if (error) throw error;

  const per = {};
  (telat || []).forEach((t) => { (per[t.penghuni_id] = per[t.penghuni_id] || []).push(t); });

  for (const [phId, rows] of Object.entries(per)) {
    const items = rows
      .map((t) => ({ label: `Telat Kelompok ${t.jenis} (${ctx.persen}%)`, nominal: Math.round((t.total * ctx.persen) / 100) }))
      .filter((i) => i.nominal > 0);
    if (!items.length) continue;
    const jumlah = items.reduce((s, i) => s + i.nominal, 0);

    const { data: d, error: eD } = await supabase.from('tagihan').select('id, total, status, tagihan_item(label)')
      .eq('penghuni_id', phId).eq('periode', ctx.periode).eq('jenis', 'DENDA').maybeSingle();
    if (eD) throw eD;

    if (!d) {
      const { data: baru, error: eB } = await supabase.from('tagihan')
        .insert({ penghuni_id: phId, jenis: 'DENDA', periode: ctx.periode, total: jumlah, batas_bayar: null })
        .select('id').single();
      if (eB) {
        if (eB.code === '23505') continue;
        throw eB;
      }
      await supabase.from('tagihan_item').insert(items.map((i) => ({ tagihan_id: baru.id, label: i.label, nominal: i.nominal })));
      const { data: ph } = await supabase.from('penghuni').select('user_id').eq('id', phId).maybeSingle();
      if (ph) {
        await supabase.from('notifikasi').insert({
          user_id: ph.user_id,
          judul: 'Denda keterlambatan',
          isi: `Tagihan melewati batas bayar. Denda ${fmt.rupiah(jumlah)} dikenakan.`
        });
      }
    } else if (BELUM_FINAL.includes(d.status)) {
      const sudah = new Set((d.tagihan_item || []).map((i) => i.label));
      const tambah = items.filter((i) => !sudah.has(i.label));
      if (tambah.length) {
        await supabase.from('tagihan_item').insert(tambah.map((i) => ({ tagihan_id: d.id, label: i.label, nominal: i.nominal })));
        await supabase.from('tagihan').update({ total: d.total + tambah.reduce((s, i) => s + i.nominal, 0) }).eq('id', d.id);
      }
    }
  }
}

// Pengingat: dari 2 hari sebelum sampai hari batas bayar, sekali per bulan per penghuni
async function buatPengingat(ctx) {
  if (ctx.hariIni < fmt.geserHari(ctx.batasBayar, -2) || ctx.hariIni > ctx.batasBayar) return;

  const { data, error } = await supabase.from('tagihan')
    .select('jenis, total, penghuni:penghuni_id(user_id, aktif)')
    .eq('periode', ctx.periode).in('jenis', ['A', 'B']).in('status', ['belum_dibayar', 'ditolak']);
  if (error) throw error;

  const per = {};
  (data || []).forEach((t) => {
    if (!t.penghuni || !t.penghuni.aktif) return;
    (per[t.penghuni.user_id] = per[t.penghuni.user_id] || []).push(t);
  });

  const awal = new Date(ctx.periode + 'T00:00:00+07:00').toISOString();
  for (const [uid, rows] of Object.entries(per)) {
    const { data: sudah } = await supabase.from('notifikasi').select('id')
      .eq('user_id', uid).like('judul', 'Pengingat:%').gte('created_at', awal).limit(1);
    if (sudah && sudah.length) continue;
    rows.sort((a, b) => a.jenis.localeCompare(b.jenis));
    const tanggal = fmt.tanggalPanjang(ctx.batasBayar).replace(/ \d{4}$/, '');
    await supabase.from('notifikasi').insert({
      user_id: uid,
      judul: `Pengingat: ${rows.length} item belum lunas`,
      isi: `Batas bayar ${tanggal}: ${rows.map((r) => `Kelompok ${r.jenis} ${fmt.rupiah(r.total)}`).join(' dan ')}.`
    });
  }
}
// Job: aman dijalankan berulang (idempotent). Satu proses pada satu waktu.
let berjalan = null;
async function jalankanJobInti() {
  const ctx = await buatKonteks();
  const { data: phs, error } = await supabase.from('penghuni')
    .select('id, tanggal_masuk, user:user_id(status_akun)').eq('aktif', true);
  if (error) throw error;
  for (const ph of phs || []) {
    const u = Array.isArray(ph.user) ? ph.user[0] : ph.user;
    if (u && u.status_akun === 'aktif') await buatTagihan(ph, ctx);
  }
  await tandaiTelat(ctx);
  await buatDenda(ctx);
  await buatPengingat(ctx);
}
function jalankanJob() {
  if (!berjalan) berjalan = jalankanJobInti().finally(() => { berjalan = null; });
  return berjalan;
}

// Ringkasan beranda penghuni (A, B, dan Denda jika ada)
async function ringkasanBulanIni(penghuniId) {
  const ctx = await buatKonteks();
  const { data: ph, error: ePh } = await supabase.from('penghuni')
    .select('id, tanggal_masuk').eq('id', penghuniId).maybeSingle();
  if (ePh) throw ePh;
  if (!ph) return null;

  await buatTagihan(ph, ctx);
  await tandaiTelat(ctx, penghuniId);
  await buatDenda(ctx, penghuniId);

  const { data: daftar, error } = await supabase.from('tagihan')
    .select('id, jenis, total, status, batas_bayar')
    .eq('penghuni_id', penghuniId).eq('periode', ctx.periode).in('jenis', ['A', 'B', 'DENDA']).order('jenis');
  if (error) throw error;

  const { data: rek } = await supabase.from('rekening_tujuan').select('*').in('jenis', ['A', 'B', 'DENDA']);
  const rekMap = Object.fromEntries((rek || []).map((r) => [r.jenis, r]));

  const kartu = (daftar || []).map((t) => ({
    ...t,
    label: t.jenis === 'DENDA' ? 'Denda' : `Kelompok ${t.jenis}`,
    rekening: rekMap[t.jenis] || null,
    sejak: t.jenis === 'DENDA' ? null : ctx.komp[t.jenis].sejak
  }));

  return {
    periode: ctx.periode,
    bulan: fmt.bulanTahun(ctx.periode),
    batasBayar: ctx.batasBayar,
    sisa: fmt.selisihHari(ctx.hariIni, ctx.batasBayar),
    total: kartu.reduce((s, k) => s + k.total, 0),
    status: URUTAN_BAHAYA.find((s) => kartu.some((k) => k.status === s)) || 'belum_dibayar',
    kartu
  };
}

module.exports = { ringkasanBulanIni, jalankanJob, URUTAN_BAHAYA };