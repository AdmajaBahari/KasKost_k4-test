const supabase = require('../config/supabase');

// Dipakai script sekarang, dan nanti oleh halaman "Persetujuan Pendaftar" milik Pemilik.
async function setujuiPendaftar(userId) {
  const { data: user } = await supabase.from('users')
    .select('id, role, status_akun').eq('id', userId).maybeSingle();
  if (!user || user.role !== 'penghuni') return { ok: false, pesan: 'Pendaftar tidak ditemukan.' };
  if (user.status_akun !== 'menunggu_persetujuan') {
    return { ok: false, pesan: 'Akun tidak sedang menunggu persetujuan.' };
  }

  const { data: ph } = await supabase.from('penghuni')
    .select('id, kamar_id').eq('user_id', userId).maybeSingle();
  if (!ph || !ph.kamar_id) return { ok: false, pesan: 'Data kamar pendaftar tidak ada.' };

  const { data: kamar } = await supabase.from('kamar')
    .select('id, nama, status').eq('id', ph.kamar_id).maybeSingle();
  if (!kamar || kamar.status !== 'kosong') {
    return { ok: false, pesan: 'Kamar sudah terisi atau nonaktif.' };
  }

  // index unik "satu penghuni aktif per kamar" menolak kalau kamar sudah diambil orang lain
  const { error: ePh } = await supabase.from('penghuni')
    .update({ aktif: true, tanggal_masuk: new Date().toISOString().slice(0, 10) })
    .eq('id', ph.id);
  if (ePh) return { ok: false, pesan: 'Kamar sudah dipakai penghuni lain.' };

  await supabase.from('kamar').update({ status: 'terisi' }).eq('id', kamar.id);
  await supabase.from('users').update({ status_akun: 'aktif', alasan_penolakan: null }).eq('id', userId);
  await supabase.from('notifikasi').insert({
    user_id: userId,
    judul: 'Pendaftaran disetujui',
    isi: `Akunmu aktif dan terdaftar di ${kamar.nama}.`
  });
  return { ok: true };
}

async function tolakPendaftar(userId, alasan) {
  const { data: user } = await supabase.from('users')
    .select('id, role, status_akun').eq('id', userId).maybeSingle();
  if (!user || user.role !== 'penghuni') return { ok: false, pesan: 'Pendaftar tidak ditemukan.' };
  if (user.status_akun !== 'menunggu_persetujuan') {
    return { ok: false, pesan: 'Akun tidak sedang menunggu persetujuan.' };
  }
  await supabase.from('users')
    .update({ status_akun: 'ditolak', alasan_penolakan: alasan || null }).eq('id', userId);
  await supabase.from('notifikasi').insert({
    user_id: userId,
    judul: 'Pendaftaran ditolak',
    isi: alasan || 'Pendaftaranmu ditolak oleh Pemilik.'
  });
  return { ok: true };
}

module.exports = { setujuiPendaftar, tolakPendaftar };