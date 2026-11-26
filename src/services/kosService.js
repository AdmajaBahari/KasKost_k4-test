const supabase = require('../config/supabase');
const fmt = require('../utils/format');

const urut = (a, b) => String(a).localeCompare(String(b), 'id', { numeric: true });
const NAMA_OK = /^[\p{L}\p{N} .\-]{1,30}$/u;
const bersih = (n) => String(n || '').replace(/\s+/g, ' ').trim();

async function notif(userId, judul, isi) {
  await supabase.from('notifikasi').insert({ user_id: userId, judul, isi });
}

// ----- Penghuni -----
async function daftarPenghuni() {
  const { data, error } = await supabase.from('penghuni')
    .select('id, aktif, kamar:kamar_id(id, nama), user:user_id(id, email, nama_lengkap, status_akun)');
  if (error) throw error;
  return (data || [])
    .filter((p) => p.user && ['aktif', 'nonaktif'].includes(p.user.status_akun))
    .map((p) => ({
      id: p.id,
      kamar: p.kamar ? p.kamar.nama : null,
      nama: p.user.nama_lengkap || '-',
      email: p.user.email,
      status: p.user.status_akun
    }))
    .sort((a, b) => urut(a.kamar || '~', b.kamar || '~'));
}

async function kamarKosong() {
  const { data, error } = await supabase.from('kamar').select('id, nama').eq('status', 'kosong');
  if (error) throw error;
  return (data || []).sort((a, b) => urut(a.nama, b.nama));
}

async function pindahkan(penghuniId, kamarBaruId) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif, kamar_id, user_id').eq('id', penghuniId).maybeSingle();
  if (error) throw error;
  if (!ph || !ph.aktif || ph.kamar_id === kamarBaruId) return { ok: false };

  // ambil kamar tujuan hanya jika masih kosong
  const { data: ambil, error: e1 } = await supabase.from('kamar')
    .update({ status: 'terisi' }).eq('id', kamarBaruId).eq('status', 'kosong').select('nama');
  if (e1) throw e1;
  if (!ambil || !ambil.length) return { ok: false };

  const { error: e2 } = await supabase.from('penghuni').update({ kamar_id: kamarBaruId }).eq('id', penghuniId);
  if (e2) {
    await supabase.from('kamar').update({ status: 'kosong' }).eq('id', kamarBaruId);
    return { ok: false };
  }
  if (ph.kamar_id) await supabase.from('kamar').update({ status: 'kosong' }).eq('id', ph.kamar_id);
  await notif(ph.user_id, 'Kamar dipindahkan', `Kamarmu dipindahkan ke ${ambil[0].nama}.`);
  return { ok: true };
}

async function nonaktifkanPenghuni(penghuniId) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif, kamar_id, user_id').eq('id', penghuniId).maybeSingle();
  if (error) throw error;
  if (!ph || !ph.aktif) return { ok: false };

  const { error: e1 } = await supabase.from('penghuni').update({ aktif: false, kamar_id: null }).eq('id', penghuniId);
  if (e1) throw e1;
  if (ph.kamar_id) await supabase.from('kamar').update({ status: 'kosong' }).eq('id', ph.kamar_id);
  await supabase.from('users').update({ status_akun: 'nonaktif' }).eq('id', ph.user_id);
  return { ok: true };
}

// Penghuni nonaktif diaktifkan kembali dan ditempatkan di kamar yang masih kosong
async function aktifkanPenghuni(penghuniId, kamarId) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif, user_id').eq('id', penghuniId).maybeSingle();
  if (error) throw error;
  if (!ph || ph.aktif) return { ok: false };

  // hanya akun yang berstatus nonaktif (bukan pendaftar yang belum disetujui)
  const { data: user, error: eU } = await supabase.from('users')
    .select('id, role, status_akun').eq('id', ph.user_id).maybeSingle();
  if (eU) throw eU;
  if (!user || user.role !== 'penghuni' || user.status_akun !== 'nonaktif') return { ok: false };

  // ambil kamar tujuan hanya jika masih kosong
  const { data: ambil, error: e1 } = await supabase.from('kamar')
    .update({ status: 'terisi' }).eq('id', kamarId).eq('status', 'kosong').select('nama');
  if (e1) throw e1;
  if (!ambil || !ambil.length) return { ok: false };

  const kembalikanKamar = () => supabase.from('kamar').update({ status: 'kosong' }).eq('id', kamarId);

  // tanggal_masuk diperbarui supaya aturan "masuk setelah batas bayar ditagih bulan depan" tetap berlaku
  const { error: e2 } = await supabase.from('penghuni')
    .update({ aktif: true, kamar_id: kamarId, tanggal_masuk: fmt.hariIniWIB() }).eq('id', penghuniId);
  if (e2) { await kembalikanKamar(); return { ok: false }; }

  const { error: e3 } = await supabase.from('users').update({ status_akun: 'aktif' }).eq('id', ph.user_id);
  if (e3) {
    await supabase.from('penghuni').update({ aktif: false, kamar_id: null }).eq('id', penghuniId);
    await kembalikanKamar();
    return { ok: false };
  }

  await notif(ph.user_id, 'Akun diaktifkan kembali', `Akunmu aktif lagi dan ditempatkan di ${ambil[0].nama}.`);
  return { ok: true };
}

// Hapus permanen penghuni. Ditolak jika ada pembayaran yang sudah masuk kas.
async function hapusPenghuni(penghuniId) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif, kamar_id, user_id, user:user_id(role)').eq('id', penghuniId).maybeSingle();
  if (error) throw error;
  const u = ph && (Array.isArray(ph.user) ? ph.user[0] : ph.user);
  if (!ph || !u || u.role !== 'penghuni') return { ok: false, alasan: 'tidak_ada' };

  const { data: tg, error: e1 } = await supabase.from('tagihan').select('id').eq('penghuni_id', ph.id);
  if (e1) throw e1;
  const ids = (tg || []).map((t) => t.id);

  let berkas = [];
  if (ids.length) {
    const { data: bk, error: e2 } = await supabase.from('bukti_pembayaran').select('status, file_path').in('tagihan_id', ids);
    if (e2) throw e2;
    // pembayaran yang sudah masuk kas tidak boleh hilang
    if ((bk || []).some((b) => b.status === 'disetujui')) return { ok: false, alasan: 'ada_pembayaran' };
    berkas = [...new Set((bk || []).map((b) => b.file_path))];
  }

  // akun, penghuni, tagihan, bukti, dan notifikasi ikut terhapus (cascade)
  const { error: e3 } = await supabase.from('users').delete().eq('id', ph.user_id);
  if (e3) throw e3;

  if (ph.aktif && ph.kamar_id) {
    await supabase.from('kamar').update({ status: 'kosong' }).eq('id', ph.kamar_id).eq('status', 'terisi');
  }

  // hapus foto yang tidak lagi dipakai baris bukti lain (bukti ganda bisa berbagi berkas)
  if (berkas.length) {
    const { data: masih } = await supabase.from('bukti_pembayaran').select('file_path').in('file_path', berkas);
    const dipakai = new Set((masih || []).map((b) => b.file_path));
    const hapus = berkas.filter((x) => !dipakai.has(x));
    if (hapus.length) await supabase.storage.from('bukti-pembayaran').remove(hapus).catch(() => {});
  }
  return { ok: true };
}

// Hapus kamar: hanya kamar Kosong/Nonaktif yang tidak dipilih pendaftar
async function hapusKamar(id) {
  const { data: k, error } = await supabase.from('kamar').select('id, status').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!k || k.status === 'terisi') return { ok: false };

  const { data: rujuk, error: e1 } = await supabase.from('penghuni')
    .select('id, aktif, user:user_id(status_akun)').eq('kamar_id', id);
  if (e1) throw e1;
  const status = (p) => { const u = Array.isArray(p.user) ? p.user[0] : p.user; return u ? u.status_akun : null; };
  if ((rujuk || []).some((p) => p.aktif || ['menunggu_email', 'menunggu_persetujuan'].includes(status(p)))) return { ok: false };

  if ((rujuk || []).length) await supabase.from('penghuni').update({ kamar_id: null }).eq('kamar_id', id);
  const { data: hapus, error: e2 } = await supabase.from('kamar').delete().eq('id', id).neq('status', 'terisi').select('id');
  if (e2) {
    if (e2.code === '23503') return { ok: false }; // baru saja dipilih pendaftar lain
    throw e2;
  }
  return { ok: !!(hapus && hapus.length) };
}
// ----- Kamar -----
async function daftarKamar() {
  const { data: kamar, error } = await supabase.from('kamar').select('id, nama, status');
  if (error) throw error;
  const { data: phs } = await supabase.from('penghuni')
    .select('kamar_id, user:user_id(nama_lengkap, email)').eq('aktif', true).not('kamar_id', 'is', null);

  const huni = {};
  (phs || []).forEach((p) => { if (p.user) huni[p.kamar_id] = p.user.nama_lengkap || p.user.email; });

  const daftar = (kamar || [])
    .map((k) => ({ id: k.id, nama: k.nama, status: k.status, penghuni: huni[k.id] || null }))
    .sort((a, b) => urut(a.nama, b.nama));
  const hitung = (s) => daftar.filter((k) => k.status === s).length;
  return { daftar, ringkas: { jumlah: daftar.length, terisi: hitung('terisi'), kosong: hitung('kosong'), nonaktif: hitung('nonaktif') } };
}

async function namaTerpakai(nama, kecualiId) {
  let q = supabase.from('kamar').select('id').ilike('nama', nama);
  if (kecualiId) q = q.neq('id', kecualiId);
  const { data, error } = await q.limit(1);
  if (error) throw error;
  return !!(data && data.length);
}

async function tambahKamar(namaMentah) {
  const nama = bersih(namaMentah);
  if (!NAMA_OK.test(nama)) return { ok: false, alasan: 'nama' };
  if (await namaTerpakai(nama)) return { ok: false, alasan: 'duplikat' };
  const { error } = await supabase.from('kamar').insert({ nama });
  if (error) {
    if (error.code === '23505') return { ok: false, alasan: 'duplikat' };
    throw error;
  }
  return { ok: true };
}

async function ubahKamar(id, namaMentah) {
  const nama = bersih(namaMentah);
  if (!NAMA_OK.test(nama)) return { ok: false, alasan: 'nama' };
  if (await namaTerpakai(nama, id)) return { ok: false, alasan: 'duplikat' };
  const { data, error } = await supabase.from('kamar').update({ nama }).eq('id', id).select('id');
  if (error) {
    if (error.code === '23505') return { ok: false, alasan: 'duplikat' };
    throw error;
  }
  return { ok: !!(data && data.length) };
}

// hanya kamar kosong yang boleh dinonaktifkan
async function nonaktifkanKamar(id) {
  const { data, error } = await supabase.from('kamar')
    .update({ status: 'nonaktif' }).eq('id', id).eq('status', 'kosong').select('id');
  if (error) throw error;
  return { ok: !!(data && data.length) };
}

async function aktifkanKamar(id) {
  const { data, error } = await supabase.from('kamar')
    .update({ status: 'kosong' }).eq('id', id).eq('status', 'nonaktif').select('id');
  if (error) throw error;
  return { ok: !!(data && data.length) };
}

module.exports = {
  daftarPenghuni, kamarKosong, pindahkan, nonaktifkanPenghuni, aktifkanPenghuni,
  daftarKamar, tambahKamar, ubahKamar, nonaktifkanKamar, aktifkanKamar, hapusKamar, hapusPenghuni
};