const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function emailValid(e) {
  return typeof e === 'string' && e.length <= 254 && EMAIL_RE.test(e);
}

function passwordKuat(p) {
  return typeof p === 'string' && p.length >= 8 && p.length <= 72 && /[A-Za-z]/.test(p) && /\d/.test(p);
}

module.exports = { emailValid, passwordKuat };