const supabase = require('../config/supabase');
const fmt = require('../utils/format');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BELUM_FINAL = ['belum_dibayar', 'telat', 'ditolak'];
const AWALAN = 'Denda manual: ';
const MAKS_NOMINAL = 10000000;

const bersih = (t) => String(t || '').replace(/\s+/g, ' ').trim();

function bacaNominal(mentah) {
  const s = String(mentah || '').trim().replace(/^rp\.?\s*/i, '');
  if (!s) return { error: 'Nominal wajib diisi.' };
  if (!/^\d+$/.test(s) && !/^\d{1,3}(\.\d{3})+$/.test(s)) return { error: 'Isi nominal dengan angka saja, contoh 50000 atau 50.000.' };
  const n = parseInt(s.replace(/\./g, ''), 10);
  if (n <= 0) return { error: 'Nominal harus lebih dari 0.' };
  if (n > MAKS_NOMINAL) return { error: 'Nominal terlalu besar (maksimal Rp 10.000.000).' };
  return { n };
}

function periodeBoleh() {
  const ini = fmt.hariIniWIB().slice(0, 8) + '01';
  return [ini, fmt.geserHari(ini, -1).slice(0, 8) + '01'];
}

async function pilihan() {
  const { data, error } = await supabase.from('penghuni')
    .select('id, kamar:kamar_id(nama), user:user_id(nama_lengkap, email)').eq('aktif', true);
  if (error) throw error;
  const penghuni = (data || [])
    .filter((p) => p.user)
    .map((p) => ({ id: p.id, kamar: p.kamar ? p.kamar.nama : '-', nama: p.user.nama_lengkap || p.user.email }))
    .sort((a, b) => a.kamar.localeCompare(b.kamar, 'id', { numeric: true }))
    .map((p) => ({ id: p.id, label: `${p.kamar} · ${p.nama}` }));
  return { periode: periodeBoleh().map((p) => ({ nilai: p, label: fmt.bulanTahun(p) })), penghuni };
}

// Tambah atau kurangi total dengan pengecekan versi (aman terhadap job yang berjalan bersamaan)
async function ubahTotal(tagihanId, selisih) {
  for (let i = 0; i < 3; i++) {
    const { data: t } = await supabase.from('tagihan').select('total').eq('id', tagihanId).maybeSingle();
    if (!t) return false;
    const { data: ok, error } = await supabase.from('tagihan')
      .update({ total: t.total + selisih }).eq('id', tagihanId).eq('total', t.total).select('id');
    if (error) throw error;
    if (ok && ok.length) return true;
  }
  return false;
}

async function beriDenda({ pengelola, penghuniId, periode, alasan, nominal }) {
  const gagal = (field, pesan) => ({ ok: false, error: { field, pesan } });

  if (!UUID.test(penghuniId)) return gagal('penghuni', 'Pilih penghuni.');
  if (!periodeBoleh().includes(periode)) return gagal('periode', 'Pilih periode yang tersedia.');
  const a = bersih(alasan);
  if (a.length < 3 || a.length > 80) return gagal('alasan', 'Alasan 3 sampai 80 karakter.');
  const n = bacaNominal(nominal);
  if (n.error) return gagal('nominal', n.error);

  const { data: ph, error: eP } = await supabase.from('penghuni').select('id, aktif, user_id').eq('id', penghuniId).maybeSingle();
  if (eP) throw eP;
  if (!ph || !ph.aktif) return gagal('penghuni', 'Penghuni tidak ditemukan atau sudah nonaktif.');

  const ambil = async () => {
    const { data, error } = await supabase.from('tagihan').select('id, total, status')
      .eq('penghuni_id', ph.id).eq('periode', periode).eq('jenis', 'DENDA').maybeSingle();
    if (error) throw error;
    return data;
  };

  const label = AWALAN + a;
  let d = await ambil();
  let baru = false;

  if (d) {
    if (!BELUM_FINAL.includes(d.status)) {
      return gagal('penghuni', 'Denda periode ini sudah dibayar atau sedang diperiksa pengelola, jadi tidak bisa ditambah.');
    }
    // cegah kiriman ganda (klik dua kali)
    const { data: dup } = await supabase.from('tagihan_item').select('id')
      .eq('tagihan_id', d.id).eq('label', label).eq('nominal', n.n)
      .gte('created_at', new Date(Date.now() - 10000).toISOString()).limit(1);
    if (dup && dup.length) return { ok: true };
  } else {
    const { data: b, error: e1 } = await supabase.from('tagihan')
      .insert({ penghuni_id: ph.id, jenis: 'DENDA', periode, total: n.n, batas_bayar: null }).select('id, total, status').single();
    if (e1) {
      if (e1.code !== '23505') throw e1;
      d = await ambil(); // dibuat proses lain pada saat bersamaan
      if (!d) return gagal('penghuni', 'Gagal memproses. Coba lagi.');
    } else {
      d = b;
      baru = true;
    }
  }

  const { data: item, error: e2 } = await supabase.from('tagihan_item')
    .insert({ tagihan_id: d.id, label, nominal: n.n, dicatat_oleh: pengelola.id }).select('id').single();
  if (e2) {
    if (baru) await supabase.from('tagihan').delete().eq('id', d.id);
    throw e2;
  }

  if (!baru && !(await ubahTotal(d.id, n.n))) {
    await supabase.from('tagihan_item').delete().eq('id', item.id);
    return gagal('penghuni', 'Gagal memperbarui total. Coba lagi.');
  }

  await supabase.from('notifikasi').insert({
    user_id: ph.user_id,
    judul: 'Denda ditambahkan',
    isi: `${fmt.rupiah(n.n)}: ${a}. Cek tagihan Denda di beranda.`
  });
  return { ok: true };
}

async function batalkan(itemId) {
  const { data: it, error } = await supabase.from('tagihan_item')
    .select('id, label, nominal, tagihan:tagihan_id(id, total, status, penghuni:penghuni_id(user_id))')
    .eq('id', itemId).maybeSingle();
  if (error) throw error;
  if (!it || !it.tagihan || !it.label.startsWith(AWALAN)) return { ok: false };
  if (!BELUM_FINAL.includes(it.tagihan.status)) return { ok: false };

  const { data: hapus, error: e1 } = await supabase.from('tagihan_item').delete().eq('id', itemId).select('id');
  if (e1) throw e1;
  if (!hapus || !hapus.length) return { ok: false };

  if (it.tagihan.total - it.nominal <= 0) {
    await supabase.from('tagihan').delete().eq('id', it.tagihan.id);
  } else {
    await ubahTotal(it.tagihan.id, -it.nominal);
  }
  if (it.tagihan.penghuni) {
    await supabase.from('notifikasi').insert({
      user_id: it.tagihan.penghuni.user_id,
      judul: 'Denda dibatalkan',
      isi: `${fmt.rupiah(it.nominal)}: ${it.label.slice(AWALAN.length)}.`
    });
  }
  return { ok: true };
}

async function terakhir() {
  const { data, error } = await supabase.from('tagihan_item')
    .select('id, label, nominal, created_at, tagihan:tagihan_id(status, periode, penghuni:penghuni_id(kamar:kamar_id(nama), user:user_id(nama_lengkap, email)))')
    .like('label', AWALAN + '%').order('created_at', { ascending: false }).limit(10);
  if (error) throw error;
  return (data || []).filter((i) => i.tagihan).map((i) => {
    const ph = i.tagihan.penghuni;
    return {
      id: i.id,
      tanggal: fmt.tanggalWIB(i.created_at),
      kamar: ph && ph.kamar ? ph.kamar.nama : '-',
      nama: ph && ph.user ? (ph.user.nama_lengkap || ph.user.email) : '-',
      alasan: i.label.slice(AWALAN.length),
      nominal: i.nominal,
      status: i.tagihan.status,
      bisaBatal: BELUM_FINAL.includes(i.tagihan.status)
    };
  });
}

module.exports = { pilihan, beriDenda, batalkan, terakhir };