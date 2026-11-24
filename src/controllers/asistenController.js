const asisten = require('../services/asistenService');

const TAUTAN = {
  penghuni: { href: '/beranda', label: 'Lihat Tagihan Saya' },
  pemilik: { href: '/pemilik/tagihan/semua', label: 'Lihat Tagihan' },
  admin: { href: '/admin/tagihan', label: 'Lihat Verifikasi' }
};

function halaman(req, res) {
  res.render('pages/akun/asisten', {
    title: 'Asisten AI',
    peran: req.user.role,
    daftar: asisten.daftarPertanyaan(req.user.role),
    tautan: TAUTAN[req.user.role]
  });
}

// Hanya menerima JSON berisi id pertanyaan (tidak ada teks bebas)
async function tanya(req, res) {
  if (!req.is('application/json')) return res.status(415).json({ ok: false, jenis: 'tidak_valid' });
  const id = String((req.body && req.body.id) || '').slice(0, 60);
  try {
    res.json(await asisten.jawab(req.user, id));
  } catch (e) {
    console.error('[ASISTEN]', e.message);
    res.json({ ok: false, jenis: 'gagal' });
  }
}

module.exports = { halaman, tanya };