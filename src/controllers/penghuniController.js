const supabase = require('../config/supabase');
const tagihanService = require('../services/tagihanService');

async function beranda(req, res) {
  const { data: ph, error } = await supabase.from('penghuni')
    .select('id, aktif').eq('user_id', req.user.id).maybeSingle();
  if (error) throw error;

  const data = ph && ph.aktif ? await tagihanService.ringkasanBulanIni(ph.id) : null;
  res.render('pages/penghuni/beranda', { title: 'Beranda', data });
}

module.exports = { beranda };