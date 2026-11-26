// Asisten AI: carousel 3 pertanyaan (geser satu per klik) dan jawaban berupa kartu
(function () {
  var chat = document.getElementById('percakapan');
  var rel = document.getElementById('rel');
  var jalur = document.getElementById('rel-jalur');
  var wadahTitik = document.getElementById('rel-titik');
  if (!chat || !rel || !jalur) return;

  var item = Array.prototype.slice.call(jalur.querySelectorAll('.rel-item'));
  var panah = rel.querySelectorAll('[data-arah]');
  var posisi = 0;

  function tampil() {
    var n = parseInt(getComputedStyle(rel).getPropertyValue('--tampil'), 10);
    return n > 0 ? n : 3;
  }
  function maks() { return Math.max(item.length - tampil(), 0); }
  function langkah() {
    if (!item.length) return 0;
    var gaya = getComputedStyle(jalur);
    var celah = parseFloat(gaya.columnGap || gaya.gap) || 0;
    return item[0].offsetWidth + celah;
  }

  function bangunTitik() {
    wadahTitik.textContent = '';
    for (var i = 0; i <= maks(); i++) {
      (function (idx) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('aria-label', 'Tampilkan pertanyaan ' + (idx + 1) + ' sampai ' + (idx + tampil()));
        b.addEventListener('click', function () { pindah(idx); });
        wadahTitik.appendChild(b);
      })(i);
    }
  }

  function perbarui() {
    var t = tampil();
    posisi = Math.min(Math.max(posisi, 0), maks());
    jalur.style.transform = 'translateX(' + (-posisi * langkah()) + 'px)';
    item.forEach(function (el, i) { el.inert = !(i >= posisi && i < posisi + t); });
    panah.forEach(function (b) {
      var arah = parseInt(b.getAttribute('data-arah'), 10);
      b.disabled = arah < 0 ? posisi <= 0 : posisi >= maks();
    });
    Array.prototype.forEach.call(wadahTitik.children, function (b, i) {
      if (i === posisi) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  function pindah(n) { posisi = n; perbarui(); }

  panah.forEach(function (b) {
    b.addEventListener('click', function () { pindah(posisi + parseInt(b.getAttribute('data-arah'), 10)); });
  });
  window.addEventListener('resize', function () { bangunTitik(); perbarui(); });
  bangunTitik();
  perbarui();

  // ----- percakapan -----
  function el(tag, kelas, teks) {
    var e = document.createElement(tag);
    if (kelas) e.className = kelas;
    if (teks != null) e.textContent = teks;
    return e;
  }
  function gelembungAi() {
    var baris = el('div', 'pesan pesan-ai');
    var av = el('span', 'avatar-ai');
    var ikon = document.getElementById('ikon-ai');
    if (ikon && ikon.firstElementChild) av.appendChild(ikon.firstElementChild.cloneNode(true));
    var g = el('div', 'gelembung');
    baris.appendChild(av);
    baris.appendChild(g);
    chat.appendChild(baris);
    return g;
  }
  function badge(status) {
    var aman = String(status).replace(/[^a-z_]/g, '');
    var sumber = document.querySelector('#bank-badge [data-status="' + aman + '"]');
    return sumber && sumber.firstElementChild ? sumber.firstElementChild.cloneNode(true) : null;
  }
  function isiKartu(g, k) {
    g.className = 'gelembung kartu-ai';
    g.textContent = '';
    g.appendChild(el('h2', null, k.judul));
    (k.baris || []).forEach(function (b) {
      var r = el('div', 'kv');
      r.appendChild(el('span', 'text-secondary', b.label));
      if (b.nilai != null || b.status) {
        var kanan = el('span', 'kv-aksi');
        if (b.nilai != null) kanan.appendChild(el('strong', null, b.nilai));
        if (b.status) { var bd = badge(b.status); if (bd) kanan.appendChild(bd); }
        r.appendChild(kanan);
      }
      g.appendChild(r);
    });
    if (k.catatan) g.appendChild(el('p', 'catatan-ai', k.catatan));
  }
  function isiGagal(g, hasil) {
    g.className = 'gelembung kartu-ai';
    g.textContent = '';
    g.appendChild(el('strong', null, hasil.jenis === 'batas' ? 'Terlalu banyak pertanyaan.' : 'Asisten belum dapat menjawab sekarang.'));
    g.appendChild(el('p', null, hasil.pesan || 'Pertanyaan Anda belum diproses. Coba lagi beberapa saat lagi.'));
    var tautan = document.getElementById('tautan-tagihan');
    if (tautan) {
      var a = el('a', 'btn-secondary btn-kecil', tautan.getAttribute('data-label'));
      a.href = tautan.getAttribute('data-href');
      g.appendChild(a);
    }
    g.appendChild(el('p', 'text-secondary small', 'Fitur lain tetap dapat digunakan.'));
  }

  var meta = document.querySelector('meta[name="csrf-token"]');
  var token = meta ? meta.content : '';
  var sibuk = false;

  item.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (sibuk) return;
      sibuk = true;
      item.forEach(function (x) { x.classList.remove('aktif'); x.disabled = true; });
      btn.classList.add('aktif');

      var u = el('div', 'pesan pesan-user');
      u.appendChild(el('div', 'gelembung', btn.textContent.trim()));
      chat.appendChild(u);

      var g = gelembungAi();
      var muat = el('span', 'muat');
      muat.appendChild(el('span', 'spinner kecil'));
      muat.appendChild(el('span', null, ' Menyusun jawaban...'));
      g.appendChild(muat);
      chat.scrollTop = chat.scrollHeight;

      function selesai() {
        sibuk = false;
        item.forEach(function (x) { x.disabled = false; });
        chat.scrollTop = chat.scrollHeight;
      }

      fetch('/asisten/tanya', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ id: btn.getAttribute('data-pertanyaan') })
      })
        .then(function (r) { return r.json(); })
        .catch(function () { return { ok: false, jenis: 'gagal' }; })
        .then(function (hasil) {
          if (hasil && hasil.ok && hasil.kartu) isiKartu(g, hasil.kartu); else isiGagal(g, hasil || {});
        })
        .then(selesai, selesai);
    });
  });
})();