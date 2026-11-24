const crypto = require('crypto');
const supabase = require('../config/supabase');
const mailer = require('./mailer');
const { kunci } = require('../utils/token');

const MASA_BERLAKU_MENIT = 10;
const MAKS_SALAH = 5;
const JEDA_KIRIM_ULANG_DETIK = 60;

const hash = (kode) => crypto.createHmac('sha256', kunci).update(kode).digest('hex');
const buatKode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

async function kirimKode(user, tujuan = 'registrasi', emailTujuan = null) {
  const { data: terakhir } = await supabase
    .from('kode_verifikasi').select('created_at')
    .eq('user_id', user.id).eq('tujuan', tujuan)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (terakhir) {
    const selisih = (Date.now() - new Date(terakhir.created_at).getTime()) / 1000;
    if (selisih < JEDA_KIRIM_ULANG_DETIK) {
      return { ok: false, tunggu: Math.ceil(JEDA_KIRIM_ULANG_DETIK - selisih) };
    }
  }

  // kode lama dinonaktifkan
  await supabase.from('kode_verifikasi').update({ dipakai: true })
    .eq('user_id', user.id).eq('tujuan', tujuan).eq('dipakai', false);

  const kode = buatKode();
  const { error } = await supabase.from('kode_verifikasi').insert({
    user_id: user.id,
    tujuan,
    email_baru: emailTujuan,
    kode_hash: hash(kode),
    kadaluarsa: new Date(Date.now() + MASA_BERLAKU_MENIT * 60000).toISOString()
  });
  if (error) throw error;

  await mailer.kirimKodeVerifikasi(emailTujuan || user.email, kode, tujuan);
  return { ok: true };
}

async function cekKode(user, tujuan, kodeInput) {
  const { data: rec } = await supabase
    .from('kode_verifikasi').select('*')
    .eq('user_id', user.id).eq('tujuan', tujuan).eq('dipakai', false)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!rec) return { ok: false, alasan: 'tidak_ada' };
  if (new Date(rec.kadaluarsa) < new Date()) return { ok: false, alasan: 'kadaluarsa' };
  if (rec.percobaan_salah >= MAKS_SALAH) return { ok: false, alasan: 'terlalu_banyak' };

  const cocok = crypto.timingSafeEqual(
    Buffer.from(hash(String(kodeInput).trim())),
    Buffer.from(rec.kode_hash)
  );

  if (!cocok) {
    await supabase.from('kode_verifikasi')
      .update({ percobaan_salah: rec.percobaan_salah + 1 }).eq('id', rec.id);
    return { ok: false, alasan: 'salah', sisa: MAKS_SALAH - (rec.percobaan_salah + 1) };
  }

  await supabase.from('kode_verifikasi').update({ dipakai: true }).eq('id', rec.id);
  return { ok: true, rec };
}

module.exports = { kirimKode, cekKode };