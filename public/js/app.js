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
    if (f.size > 5 * 1024 * 1024) return reset('Ukuran foto maksimal 5 MB.');
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

  var slides = document.querySelectorAll('.slide');
  var titik = document.querySelectorAll('.titik span');
  var halaman = 0;
  function tampilHalaman(n) {
    if (!slides.length) return;
    halaman = (n + slides.length) % slides.length;
    slides.forEach(function (s, i) { s.hidden = i !== halaman; });
    titik.forEach(function (t, i) { t.classList.toggle('aktif', i === halaman); });
  }
  document.querySelectorAll('[data-geser]').forEach(function (b) {
    b.addEventListener('click', function () { tampilHalaman(halaman + parseInt(b.getAttribute('data-geser'), 10)); });
  });
  tampilHalaman(0);

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