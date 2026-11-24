-- Data awal sesuai Figma (nomor rekening di Figma masih contoh; ganti dengan yang asli)

insert into kamar (nama)
select 'Kamar ' || n from generate_series(1, 10) as n
on conflict (nama) do nothing;

insert into komponen_tagihan (kelompok, nama, nominal, berlaku_mulai) values
  ('A', 'Sewa kamar', 800000, '2026-11-01'),
  ('A', 'Wifi',       100000, '2026-11-01'),
  ('B', 'Listrik',    350000, '2026-11-01'),
  ('B', 'Gas',        100000, '2026-11-01')
on conflict do nothing;

insert into rekening_tujuan (jenis, bank, nomor, atas_nama) values
  ('A',     'BCA', '1234567890', 'Pemilik Kos'),
  ('B',     'BCA', '0987654321', 'Kas Kos'),
  ('DENDA', 'BCA', '1234567890', 'Pemilik Kos')
on conflict (jenis) do nothing;

insert into pengaturan (kunci, nilai) values
  ('batas_bayar_tanggal', '10'),
  ('persen_denda',        '10'),
  ('maks_percobaan',      '5')
on conflict (kunci) do nothing;