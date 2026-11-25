(function () {
  // Tombol "Salin"
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-salin]');
    if (!btn) return;
    var teks = btn.getAttribute('data-salin');
    var asli = btn.textContent;
    function selesai() {
      btn.textContent = 'Tersalin';
      setTimeout(function () { btn.textContent = asli; }, 1500);
    }
    function cadangan() {
      var ta = document.createElement('textarea');
      ta.value = teks; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); selesai(); } catch (err) { /* abaikan */ }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(teks).then(selesai, cadangan);
    } else {
      cadangan();
    }
  });

  // Halaman unggah bukti
  var form = document.getElementById('form-unggah');
  if (!form) return;
  var input = document.getElementById('bukti');
  var kosong = document.getElementById('drop-kosong');
  var isi = document.getElementById('drop-isi');
  var img = document.getElementById('pratinjau');
  var nama = document.getElementById('nama-file');
  var galat = document.getElementById('galat-file');
  var kirim = document.getElementById('kirim');
  var overlay = document.getElementById('overlay');
  var TIPE = ['image/jpeg', 'image/png', 'image/webp'];
  var url = null;

  function reset(pesan) {
    input.value = '';
    kirim.disabled = true;
    isi.hidden = true; kosong.hidden = false;
    if (url) { URL.revokeObjectURL(url); url = null; }
    galat.textContent = pesan || '';
    galat.hidden = !pesan;
  }

  input.addEventListener('change', function () {
    var f = input.files && input.files[0];
    if (!f) return reset();
    if (TIPE.indexOf(f.type) === -1) return reset('Format foto harus JPG, PNG, atau WebP.');
    if (f.size > 4 * 1024 * 1024) return reset('Ukuran foto maksimal 4 MB.');
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(f);
    img.src = url;
    nama.textContent = f.name;
    galat.hidden = true;
    kosong.hidden = true; isi.hidden = false;
    kirim.disabled = false;
  });

  form.addEventListener('submit', function () {
    kirim.disabled = true;
    overlay.hidden = false;
  });
})();
// Dialog konfirmasi & pencarian tabel
(function () {
  document.addEventListener('click', function (e) {
    var buka = e.target.closest('[data-dialog]');
    if (buka) {
      var dlg = document.getElementById(buka.getAttribute('data-dialog'));
      if (!dlg) return;
      var aksi = buka.getAttribute('data-aksi');
      if (aksi) {
        var f = dlg.querySelector('form');
        if (f) f.setAttribute('action', aksi);
      }
      var ringkas = buka.getAttribute('data-ringkas');
      var target = dlg.querySelector('[data-ringkas]');
      if (target && ringkas) target.textContent = ringkas; var nilai = buka.getAttribute('data-nilai'); var isiInput = dlg.querySelector('input[data-isi]'); if (isiInput && nilai !== null) isiInput.value = nilai;
      if (typeof dlg.showModal === 'function') dlg.showModal();
      return;
    }
    var tutup = e.target.closest('[data-tutup]');
    if (tutup) {
      var d = tutup.closest('dialog');
      if (d) d.close();
    }
  });

  var cari = document.querySelector('[data-cari]');
  if (cari) {
    var baris = document.querySelectorAll('[data-cari-baris]');
    cari.addEventListener('input', function () {
      var q = cari.value.trim().toLowerCase();
      baris.forEach(function (tr) {
        tr.hidden = q !== '' && tr.getAttribute('data-cari-baris').indexOf(q) === -1;
      });
    });
  }
})();
// Pilihan bulan: kirim formulir otomatis
(function () {
  document.querySelectorAll('select[data-auto]').forEach(function (s) {
    s.addEventListener('change', function () { s.form.submit(); });
  });
})();

// Catat pengeluaran: info kas dinamis dan konfirmasi sebelum simpan
(function () {
  var form = document.getElementById('form-pengeluaran');
  if (!form) return;
  var radios = form.querySelectorAll('input[name="kategori"]');
  var teksKas = form.querySelector('[data-kas-teks]');
  var dlg = document.getElementById('dlg-simpan');
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function terpilih() {
    for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i];
    return null;
  }
  function perbarui() {
    var r = terpilih();
    teksKas.textContent = r ? r.getAttribute('data-kas') : 'pilih kategori dulu';
  }
  radios.forEach(function (r) { r.addEventListener('change', perbarui); });
  perbarui();

  form.querySelector('[data-konfirmasi]').addEventListener('click', function () {
    if (!form.reportValidity()) return;
    var r = terpilih();
    var angka = form.elements['nominal'].value.replace(/\D/g, '');
    var rupiah = 'Rp ' + angka.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    var tgl = form.elements['tanggal'].value.split('-');
    var tanggal = tgl.length === 3 ? parseInt(tgl[2], 10) + ' ' + BULAN[parseInt(tgl[1], 10) - 1] + ' ' + tgl[0] : '';
    document.getElementById('ringkas-simpan').textContent = r.getAttribute('data-label') + ' · ' + rupiah + ' · ' + tanggal;
    document.getElementById('kas-simpan').textContent = r.getAttribute('data-kas');
    if (typeof dlg.showModal === 'function') dlg.showModal();
  });
})();
// Dialog yang dibuka otomatis dan tombol lihat/sembunyikan password
(function () {
  document.querySelectorAll('dialog[data-buka]').forEach(function (d) {
    if (typeof d.showModal === 'function') d.showModal();
  });
  document.querySelectorAll('[data-toggle-pw]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.getAttribute('data-toggle-pw'));
      if (!input) return;
      var tampil = input.type === 'password';
      input.type = tampil ? 'text' : 'password';
      btn.textContent = tampil ? 'Sembunyikan' : 'Lihat';
      btn.setAttribute('aria-pressed', String(tampil));
    });
  });
})();
// Asisten AI: pertanyaan pilihan, jawaban berupa kartu (tidak ada input teks bebas)
(function () {
  var chat = document.getElementById('chat');
  if (!chat) return;

  // ----- Carousel satu baris: geser satu pertanyaan per klik (satu keluar, satu masuk) -----
  var trek = document.getElementById('slides');
  var slot = trek ? Array.prototype.slice.call(trek.querySelectorAll('.slot')) : [];
  var titik = document.querySelectorAll('.titik span');
  var panah = document.querySelectorAll('[data-geser]');
  var JARAK = 12, DURASI = 280;
  var lebar = [], tampil = [], bergerak = false;
  var kurangGerak = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function atur(s, kelas, maks, margin) {
    s.className = 'slot' + (kelas ? ' ' + kelas : '');
    s.style.maxWidth = maks == null ? '' : maks;
    s.style.marginRight = margin == null ? '' : margin;
  }
  function marginUntuk(k) { return k === tampil.length - 1 ? '0px' : JARAK + 'px'; }
  function ukur() {
    // ukur lebar alami tiap pertanyaan (semua ditampilkan sementara)
    slot.forEach(function (s) { atur(s, '', null, null); s.hidden = false; });
    var W = trek.clientWidth;
    lebar = slot.map(function (s) { return Math.min(s.offsetWidth, W); });
  }
  function gambar(mulai) {
    var n = slot.length, W = trek.clientWidth, pakai = 0;
    tampil = [];
    for (var k = 0; k < n; k++) {
      var i = (mulai + k) % n, perlu = lebar[i] + (tampil.length ? JARAK : 0);
      if (tampil.length && pakai + perlu > W) break;
      pakai += perlu; tampil.push(i);
    }
    slot.forEach(function (s) { atur(s, '', null, null); s.hidden = true; });
    tampil.forEach(function (i, k) { slot[i].hidden = false; slot[i].style.marginRight = marginUntuk(k); trek.appendChild(slot[i]); });
    penanda();
  }
  function penanda() {
    var semua = tampil.length >= slot.length;
    panah.forEach(function (b) { b.hidden = semua; });
    titik.forEach(function (t, i) { t.classList.toggle('aktif', tampil.indexOf(i) !== -1); t.hidden = semua; });
  }
  function selesai(baru) {
    baru.forEach(function (s) { atur(s, '', null, null); });
    tampil.forEach(function (i, k) { slot[i].style.marginRight = marginUntuk(k); });
    bergerak = false;
    panah.forEach(function (b) { b.disabled = false; });
  }

  function geser(arah) {
    if (bergerak || tampil.length >= slot.length) return;
    bergerak = true;
    panah.forEach(function (b) { b.disabled = true; });

    var n = slot.length;
    var keluarIdx = arah > 0 ? tampil[0] : tampil[tampil.length - 1];
    var elKeluar = slot[keluarIdx];

    function tahapMasuk() {
      elKeluar.hidden = true; atur(elKeluar, '', null, null);

      var sisa = tampil.filter(function (i) { return i !== keluarIdx; });
      var pakai = sisa.reduce(function (t, i, k) { return t + lebar[i] + (k ? JARAK : 0); }, 0);
      var W = trek.clientWidth, masuk = [];
      var ujung = sisa.length ? (arah > 0 ? sisa[sisa.length - 1] : sisa[0]) : keluarIdx;
      var kandidat = arah > 0 ? (ujung + 1) % n : (ujung - 1 + n) % n;
      // tambah pertanyaan baru di sisi seberang selama masih muat satu baris
      while (kandidat !== keluarIdx && sisa.length + masuk.length < n - 1) {
        var ada = sisa.length + masuk.length;
        var perlu = lebar[kandidat] + (ada ? JARAK : 0);
        if (ada && pakai + perlu > W) break;
        pakai += perlu; masuk.push(kandidat);
        kandidat = arah > 0 ? (kandidat + 1) % n : (kandidat - 1 + n) % n;
      }
      tampil = arah > 0 ? sisa.concat(masuk) : masuk.slice().reverse().concat(sisa);

      var baru = masuk.map(function (i) {
        var s = slot[i];
        atur(s, 'anim masuk', '0px', '0px');
        s.hidden = false;
        if (arah > 0) trek.appendChild(s); else trek.insertBefore(s, trek.firstElementChild);
        return s;
      });
      // slot yang sudah ada menyesuaikan jarak (ikut bertransisi)
      tampil.forEach(function (i, k) { if (baru.indexOf(slot[i]) === -1) slot[i].style.marginRight = marginUntuk(k); });
      void trek.offsetWidth; // paksa reflow supaya transisi berjalan
      baru.forEach(function (s) {
        var i = slot.indexOf(s);
        atur(s, 'anim', lebar[i] + 'px', marginUntuk(tampil.indexOf(i)));
      });
      penanda();
      setTimeout(function () { selesai(baru); }, kurangGerak ? 0 : DURASI + 20);
    }

    if (kurangGerak) { tahapMasuk(); return; }
    // tahap 1: satu pertanyaan memudar dan menyusut
    atur(elKeluar, 'anim', elKeluar.offsetWidth + 'px', elKeluar.style.marginRight);
    void elKeluar.offsetWidth;
    atur(elKeluar, 'anim keluar', '0px', '0px');
    setTimeout(tahapMasuk, DURASI);
  }

  if (trek && slot.length) {
    ukur(); gambar(0);
    panah.forEach(function (b) {
      b.addEventListener('click', function () { geser(parseInt(b.getAttribute('data-geser'), 10)); });
    });
    var tunda = null;
    window.addEventListener('resize', function () {
      clearTimeout(tunda);
      tunda = setTimeout(function () { if (!bergerak) { var a = tampil[0] || 0; ukur(); gambar(a); } }, 150);
    });
  }

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
    baris.appendChild(av); baris.appendChild(g);
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
    var batas = hasil.jenis === 'batas';
    g.appendChild(el('strong', null, batas ? 'Terlalu banyak pertanyaan.' : 'Asisten belum dapat menjawab sekarang.'));
    g.appendChild(el('p', null, hasil.pesan || 'Pertanyaan Anda belum diproses. Coba lagi beberapa saat lagi.'));
    var tautan = document.getElementById('tautan-tagihan');
    if (tautan) {
      var a = el('a', 'btn-secondary btn-kecil', tautan.getAttribute('data-label'));
      a.href = tautan.getAttribute('data-href');
      g.appendChild(a);
    }
    g.appendChild(el('p', 'text-secondary small', 'Fitur lain tetap dapat digunakan.'));
  }

  var sibuk = false;
  var tombol = document.querySelectorAll('[data-pertanyaan]');
  tombol.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (sibuk) return;
      sibuk = true;
      tombol.forEach(function (x) { x.classList.remove('aktif'); x.disabled = true; });
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
        tombol.forEach(function (x) { x.disabled = false; });
        chat.scrollTop = chat.scrollHeight;
      }

      fetch('/asisten/tanya', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': (document.querySelector('meta[name="csrf-token"]') || {}).content || '' },
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
// Beri denda manual: konfirmasi sebelum simpan
(function () {
  var form = document.getElementById('form-denda');
  if (!form) return;
  var dlg = document.getElementById('dlg-denda');
  form.querySelector('[data-konfirmasi-denda]').addEventListener('click', function () {
    if (!form.reportValidity()) return;
    var sel = form.elements['penghuni_id'];
    var angka = form.elements['nominal'].value.replace(/\D/g, '');
    var rupiah = 'Rp ' + angka.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    document.getElementById('ringkas-denda').textContent = sel.options[sel.selectedIndex].text + ' · ' + rupiah;
    document.getElementById('alasan-denda').textContent = form.elements['alasan'].value.trim();
    if (typeof dlg.showModal === 'function') dlg.showModal();
  });
})();
// Popup profil: ikon profil di sidebar membuka kartu berisi profil dan pintasan
(function () {
  var toggle = document.getElementById('profil-toggle');
  var pop = document.getElementById('profil-pop');
  if (!toggle || !pop) return;
  var terbuka = false, timer = null;

  function buka() {
    clearTimeout(timer);
    pop.hidden = false;
    pop.classList.remove('menutup');
    void pop.offsetWidth;
    pop.classList.add('terbuka');
    document.body.classList.add('pop-buka');
    toggle.setAttribute('aria-expanded', 'true');
    terbuka = true;
    var pertama = pop.querySelector('a');
    if (pertama) pertama.focus({ preventScroll: true });
  }
  function tutup(kembaliFokus) {
    if (!terbuka) return;
    terbuka = false;
    pop.classList.remove('terbuka');
    pop.classList.add('menutup');
    document.body.classList.remove('pop-buka');
    toggle.setAttribute('aria-expanded', 'false');
    timer = setTimeout(function () { pop.hidden = true; pop.classList.remove('menutup'); }, 200);
    if (kembaliFokus) toggle.focus({ preventScroll: true });
  }

  // tanpa JavaScript, ikon tetap menjadi tautan ke halaman pengaturan
  toggle.addEventListener('click', function (e) { e.preventDefault(); if (terbuka) tutup(true); else buka(); });
  document.addEventListener('click', function (e) {
    if (terbuka && !pop.contains(e.target) && !toggle.contains(e.target)) tutup(false);
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && terbuka) tutup(true); });
})();
