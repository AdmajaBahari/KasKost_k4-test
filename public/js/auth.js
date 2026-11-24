document.querySelectorAll('[data-toggle-pw]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var input = document.getElementById(btn.dataset.togglePw);
    var tampil = input.type === 'password';
    input.type = tampil ? 'text' : 'password';
    btn.textContent = tampil ? 'Sembunyikan' : 'Lihat';
    btn.setAttribute('aria-pressed', String(tampil));
  });
});