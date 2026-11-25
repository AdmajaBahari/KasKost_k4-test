require('dotenv').config();
(async () => {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models', {
    headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }
  });
  const j = await r.json();
  console.log('HTTP', r.status);
  if (r.ok) {
    console.log((j.models || []).map((m) => m.name).filter((n) => n.includes('flash')).join('\n'));
  } else {
    const e = j.error || {};
    console.log(e.message, '|', e.details && e.details[0] && e.details[0].reason);
  }
})();