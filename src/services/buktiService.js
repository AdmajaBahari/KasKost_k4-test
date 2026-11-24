const crypto = require('crypto');
const supabase = require('../config/supabase');
const fmt = require('../utils/format');
const ocr = require('./ocrService');

const BUCKET = 'bukti-pembayaran';
// status upaya yang menghabiskan percobaan
const STATUS_TERPAKAI = ['nominal_beda', 'buram', 'duplikat', 'ditolak', 'diperiksa_pengelola'];
const BOLEH_UNGGAH = ['belum_dibayar', 'telat', 'ditolak'];
const KEYAKINAN_MIN = 60;

// Jenis file ditentukan dari isi file (bukan dari nama atau header kiriman)
function jenisFile(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: 'png' };
  if (b.slice(0, 4).toString('latin1') === 'RIFF' && b.slice(8, 12).toString('latin1') === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

async function maksPercobaan() {
  const { data } = await supabase.from('pengaturan').select('nilai').eq('kunci', 'maks_percobaan').maybeSingle();
  const n = parseInt(data && data.nilai, 10);
  return n > 0 ? n : 5;
}

async function infoPercobaan(tagihanId) {
  const maks = await maksPercobaan();
  const { count, error } = await supabase.from('bukti_pembayaran')
    .select('id', { count: 'exact', head: true })
    .eq('tagihan_id', tagihanId).in('status', STATUS_TERPAKAI);
  if (error) throw error;
  const terpakai = count || 0;
  return { maks, terpakai, sisa: Math.max(maks - terpakai, 0) };
}

async function beritahu(userId, judul, isi) {
  await supabase.from('notifikasi').insert({ user_id: userId, judul, isi });
}

async function beritahuPengelola(tagihan) {
  // Kelompok B diverifikasi Admin; Kelompok A dan Denda oleh Pemilik (asumsi, sesuaikan jika perlu)
  const peran = tagihan.jenis === 'B' ? ['admin', 'pemilik'] : ['pemilik'];
  const { data } = await supabase.from('users').select('id').in('role', peran).eq('status_akun', 'aktif');
  if (!data || !data.length) return;
  await supabase.from('notifikasi').insert(data.map((u) => ({
    user_id: u.id,
    judul: 'Bukti perlu diperiksa',
    isi: `Ada bukti pembayaran ${tagihan.jenis === 'DENDA' ? 'denda' : 'Kelompok ' + tagihan.jenis} yang menunggu verifikasi manual.`
  })));
}

async function hapusFile(path) {
  await supabase.storage.from(BUCKET).remove([path]).catch(() => {});
}

async function tolak({ tagihan, penghuni, buktiId, status, alasan, path, hash, data }) {
  const isi = { status, alasan_penolakan: alasan, ...(data || {}) };
  let id = buktiId;

  if (id) {
    const { error } = await supabase.from('bukti_pembayaran').update(isi).eq('id', id);
    if (error) throw error;
  } else {
    const { data: baru, error } = await supabase.from('bukti_pembayaran')
      .insert({ tagihan_id: tagihan.id, penghuni_id: penghuni.id, file_path: path, file_hash: hash, ...isi })
      .select('id').single();
    if (error) throw error;
    id = baru.id;
  }

  const p = await infoPercobaan(tagihan.id);
  if (p.sisa <= 0) {
    await supabase.from('bukti_pembayaran').update({ status: 'diperiksa_pengelola' }).eq('id', id);
    await supabase.from('tagihan').update({ status: 'menunggu_verifikasi' }).eq('id', tagihan.id);
    await beritahuPengelola(tagihan);
    await beritahu(penghuni.userId, 'Bukti diperiksa pengelola', 'Batas percobaan tercapai. Bukti kamu masuk antrean verifikasi manual.');
  } else {
    const telat = tagihan.batas_bayar && tagihan.batas_bayar < fmt.hariIniWIB();
    await supabase.from('tagihan').update({ status: telat ? 'telat' : 'ditolak' }).eq('id', tagihan.id);
    await beritahu(penghuni.userId, 'Bukti ditolak', alasan);
  }
  return { buktiId: id };
}

// Mengembalikan { buktiId } atau { error, ocr? }
async function proses({ tagihan, penghuni, file }) {
  const jenis = jenisFile(file.buffer);
  if (!jenis) return { error: 'Format foto harus JPG, PNG, atau WebP.' };
  if (!BOLEH_UNGGAH.includes(tagihan.status)) return { error: 'Tagihan ini tidak sedang menerima bukti.' };

  const p = await infoPercobaan(tagihan.id);
  if (p.sisa <= 0) return { error: 'Sisa percobaan habis. Bukti kamu diperiksa pengelola.' };

  // cegah kiriman ganda yang masih diproses
  const { data: sedang } = await supabase.from('bukti_pembayaran').select('id')
    .eq('tagihan_id', tagihan.id).eq('status', 'memproses')
    .gte('created_at', new Date(Date.now() - 120000).toISOString()).limit(1);
  if (sedang && sedang.length) return { error: 'Bukti sebelumnya masih diproses. Tunggu sebentar.' };

  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');

  // bukti ganda: foto yang sama sudah dipakai (diterima atau sedang diperiksa)
  const { data: dup } = await supabase.from('bukti_pembayaran').select('file_path')
    .eq('file_hash', hash).in('status', ['disetujui', 'diperiksa_pengelola']).limit(1);
  if (dup && dup.length) {
    return tolak({
      tagihan, penghuni, buktiId: null, status: 'duplikat', path: dup[0].file_path, hash,
      alasan: 'Bukti ini sudah dipakai untuk tagihan lain.'
    });
  }

  const path = `${penghuni.id}/${tagihan.id}/${Date.now()}-${hash.slice(0, 8)}.${jenis.ext}`;
  const { error: eUp } = await supabase.storage.from(BUCKET)
    .upload(path, file.buffer, { contentType: jenis.mime, upsert: false });
  if (eUp) throw eUp;

  const { data: bukti, error: eIns } = await supabase.from('bukti_pembayaran')
    .insert({ tagihan_id: tagihan.id, penghuni_id: penghuni.id, file_path: path, file_hash: hash, status: 'memproses' })
    .select('id').single();
  if (eIns) { await hapusFile(path); throw eIns; }

  let hasil;
  try {
    hasil = await ocr.bacaBukti(file.buffer, jenis.mime);
  } catch (e) {
    // gagal koneksi: tidak mengurangi percobaan
    await supabase.from('bukti_pembayaran').delete().eq('id', bukti.id);
    await hapusFile(path);
    if (e instanceof ocr.OcrError) return { error: e.message, ocr: true };
    throw e;
  }

  const data = {
    nominal_terbaca: hasil.nominal,
    tanggal_pada_bukti: hasil.tanggal,
    keyakinan: hasil.keyakinan,
    nama_pengirim: hasil.pengirim
  };
  const dasar = { tagihan, penghuni, buktiId: bukti.id, data };

  if (!hasil.buktiTransfer || !hasil.terbaca || hasil.nominal == null || hasil.keyakinan < KEYAKINAN_MIN) {
    return tolak({ ...dasar, status: 'buram', alasan: 'Foto tidak terbaca atau bukan bukti transfer.' });
  }
  if (hasil.nominal !== tagihan.total) {
    return tolak({ ...dasar, status: 'nominal_beda', alasan: 'Nominal harus sama persis. Pembayaran sebagian tidak diterima.' });
  }
  const hariIni = fmt.hariIniWIB();
  if (hasil.tanggal && (hasil.tanggal < fmt.geserHari(tagihan.periode, -10) || hasil.tanggal > fmt.geserHari(hariIni, 1))) {
    return tolak({ ...dasar, status: 'ditolak', alasan: 'Tanggal pada bukti tidak sesuai periode tagihan.' });
  }

  const { error: eOk } = await supabase.from('bukti_pembayaran')
    .update({ status: 'disetujui', alasan_penolakan: null, ...data, diverifikasi_at: new Date().toISOString() })
    .eq('id', bukti.id);
  if (eOk) throw eOk;
  await supabase.from('tagihan').update({ status: 'lunas' }).eq('id', tagihan.id);
  await beritahu(penghuni.userId, 'Pembayaran diterima', 'Bukti transfer kamu sesuai. Tagihan dinyatakan lunas.');
  return { buktiId: bukti.id };
}

module.exports = { proses, infoPercobaan };