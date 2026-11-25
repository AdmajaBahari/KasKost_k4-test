// Transisi antarhalaman: halaman memudar keluar sebelum pindah; halaman baru masuk lewat animasi CSS.
(function () {
  var KELUAR_MS = 200;
  var kurangGerak = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (kurangGerak) return;

  // kembali lewat tombol Back (cache browser): pastikan halaman tampil lagi
  window.addEventListener('pageshow', function () { document.body.classList.remove('keluar'); });

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest('a[href]');
    if (!a) return;
    if ((a.target && a.target !== '_self') || a.hasAttribute('download') || a.hasAttribute('data-tanpa-transisi')) return;

    var url;
    try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return; // halaman yang sama / #hash

    e.preventDefault();
    document.body.classList.add('keluar');
    setTimeout(function () { location.href = url.href; }, KELUAR_MS);
    // jaga-jaga bila tautan ternyata mengunduh berkas (halaman tidak berganti)
    setTimeout(function () { document.body.classList.remove('keluar'); }, 3000);
  });
})();
