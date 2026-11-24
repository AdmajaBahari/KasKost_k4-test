// Sementara, sebelum halaman persetujuan Pemilik dibuat.
// Pemakaian: node scripts/pendaftar.js setujui <email>
//            node scripts/pendaftar.js tolak <email> "alasan"
require('dotenv').config();
const supabase = require('../src/config/supabase');
const svc = require('../src/services/penghuniService');

(async () => {
  const [, , aksi, email, ...alasan] = process.argv;
  if (!['setujui', 'tolak'].includes(aksi) || !email) {
    console.log('Pemakaian: node scripts/pendaftar.js setujui <email>');
    console.log('           node scripts/pendaftar.js tolak <email> "alasan"');
    process.exitCode = 1; return;
  }
  const { data: u } = await supabase.from('users').select('id').eq('email', email.toLowerCase()).maybeSingle();
  if (!u) { console.log('Email tidak ditemukan.'); process.exitCode = 1; return; }
  const r = aksi === 'setujui'
    ? await svc.setujuiPendaftar(u.id)
    : await svc.tolakPendaftar(u.id, alasan.join(' ') || 'Tidak disebutkan');
  console.log(r.ok ? 'Berhasil.' : 'Gagal: ' + r.pesan);
  process.exitCode = r.ok ? 0 : 1;
})();