const supabase = require('../config/supabase');
const navigasi = require('../config/navigasi');
const { bacaToken } = require('../utils/token');

// Memuat pengguna dari cookie sesi; selalu mengisi res.locals
async function muatPengguna(req, res, next) {
  res.locals.user = null;
  res.locals.navCfg = null;
  res.locals.notifBelumDibaca = 0;
  res.locals.kamarUser = null;
  res.locals.path = req.path;
  try {
    const p = bacaToken(req.cookies && req.cookies.kk_token);
    if (p && p.tujuan === 'sesi') {
      const { data } = await supabase.from('users')
        .select('id, email, nama_lengkap, role, status_akun, token_versi')
        .eq('id', p.uid).maybeSingle();
      if (data && data.status_akun === 'aktif' && (p.v || 0) === (data.token_versi || 0)) {
        req.user = data;
        res.locals.user = data;
        res.locals.navCfg = navigasi[data.role];
        const hitungNotif = supabase.from('notifikasi')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', data.id).eq('dibaca', false);
        const cariKamar = data.role === 'penghuni'
          ? supabase.from('penghuni').select('kamar:kamar_id(nama)').eq('user_id', data.id).maybeSingle()
          : Promise.resolve({ data: null });
        const [{ count }, { data: ph }] = await Promise.all([hitungNotif, cariKamar]);
        res.locals.notifBelumDibaca = count || 0;
        res.locals.kamarUser = ph && ph.kamar ? ph.kamar.nama : null;
      } else {
        res.clearCookie('kk_token');
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

function wajibLogin(...peran) {
  return (req, res, next) => {
    if (!req.user) {
      const pengelola = req.path.startsWith('/pemilik') || req.path.startsWith('/admin');
      return res.redirect(pengelola ? '/masuk-pengelola' : '/masuk');
    }
    if (peran.length && !peran.includes(req.user.role)) {
      return res.status(403).send('Akses ditolak.');
    }
    next();
  };
}

module.exports = { muatPengguna, wajibLogin };