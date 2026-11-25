-- KasKost Kelompok 4 - skema database (PostgreSQL / Supabase)
-- Semua akses lewat backend memakai secret key (melewati RLS).
-- RLS diaktifkan tanpa policy supaya publishable key tidak bisa membaca data.

-- ===== Akun =====
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password_hash text not null,
  nama_lengkap text,
  no_telepon text,
  role text not null check (role in ('penghuni', 'pemilik', 'admin')),
  status_akun text not null default 'menunggu_email'
    check (status_akun in ('menunggu_email', 'menunggu_persetujuan', 'aktif', 'ditolak', 'nonaktif')),
  alasan_penolakan text,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_users_email on users (lower(email));

create table if not exists kode_verifikasi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  tujuan text not null check (tujuan in ('registrasi', 'ubah_email')),
  email_baru text,
  kode_hash text not null,
  kadaluarsa timestamptz not null,
  dipakai boolean not null default false,
  percobaan_salah int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_kode_user on kode_verifikasi (user_id, tujuan);

-- ===== Kamar & penghuni =====
create table if not exists kamar (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  status text not null default 'kosong' check (status in ('kosong', 'terisi', 'nonaktif')),
  created_at timestamptz not null default now()
);

create table if not exists penghuni (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  kamar_id uuid references kamar(id),
  tanggal_masuk date not null default current_date,
  aktif boolean not null default true
);
-- satu kamar hanya boleh punya satu penghuni aktif
create unique index if not exists uq_penghuni_kamar_aktif on penghuni (kamar_id) where aktif;

-- ===== Tarif, rekening, pengaturan =====
-- Komponen tagihan per kelompok. Versi terbaru = berlaku_mulai terbesar yang <= hari ini.
create table if not exists komponen_tagihan (
  id uuid primary key default gen_random_uuid(),
  kelompok text not null check (kelompok in ('A', 'B')),
  nama text not null,
  nominal int not null check (nominal > 0),
  berlaku_mulai date not null,
  unique (kelompok, nama, berlaku_mulai)
);

create table if not exists rekening_tujuan (
  jenis text primary key check (jenis in ('A', 'B', 'DENDA')),
  bank text not null,
  nomor text not null,
  atas_nama text not null
);

create table if not exists pengaturan (
  kunci text primary key,
  nilai text not null
);

-- ===== Tagihan & bukti =====
create table if not exists tagihan (
  id uuid primary key default gen_random_uuid(),
  penghuni_id uuid not null references penghuni(id) on delete cascade,
  jenis text not null check (jenis in ('A', 'B', 'DENDA')),
  periode date not null, -- selalu tanggal 1 pada bulan tagihan
  total int not null check (total > 0),
  batas_bayar date,
  status text not null default 'belum_dibayar'
    check (status in ('belum_dibayar', 'menunggu_verifikasi', 'lunas', 'telat', 'ditolak')),
  created_at timestamptz not null default now(),
  unique (penghuni_id, jenis, periode)
);
create index if not exists idx_tagihan_status on tagihan (status, jenis);

-- Salinan rincian saat tagihan dibuat (supaya riwayat tidak berubah kalau tarif berubah)
create table if not exists tagihan_item (
  id uuid primary key default gen_random_uuid(),
  tagihan_id uuid not null references tagihan(id) on delete cascade,
  label text not null,
  nominal int not null check (nominal > 0)
);

create table if not exists bukti_pembayaran (
  id uuid primary key default gen_random_uuid(),
  tagihan_id uuid not null references tagihan(id) on delete cascade,
  penghuni_id uuid not null references penghuni(id) on delete cascade,
  file_path text not null,       -- path di Supabase Storage (bucket bukti-pembayaran)
  file_hash text not null,       -- sha256, untuk deteksi bukti ganda
  status text not null default 'memproses'
    check (status in ('memproses', 'cocok', 'nominal_beda', 'buram', 'duplikat',
                      'diperiksa_pengelola', 'disetujui', 'ditolak')),
  nominal_terbaca int,
  tanggal_pada_bukti date,
  keyakinan numeric(5, 2),       -- persen keyakinan OCR
  alasan_penolakan text,
  diverifikasi_oleh uuid references users(id),
  diverifikasi_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_bukti_tagihan on bukti_pembayaran (tagihan_id);
create index if not exists idx_bukti_hash on bukti_pembayaran (file_hash);
create index if not exists idx_bukti_status on bukti_pembayaran (status);

-- ===== Kas =====
create table if not exists pengeluaran (
  id uuid primary key default gen_random_uuid(),
  tanggal date not null default current_date,
  kategori text not null check (kategori in ('gas', 'token_listrik', 'maintenance', 'kebersihan')),
  nominal int not null check (nominal > 0),
  catatan text,
  kas text not null check (kas in ('pemilik', 'kos')),
  dicatat_oleh uuid not null references users(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_pengeluaran_kas on pengeluaran (kas, tanggal);

-- Pemasukan kas = bukti yang disetujui. Kelompok B -> Kas Kos; A dan Denda -> Kas Pemilik.
create or replace view v_pemasukan_kas with (security_invoker = true) as
select
  b.id as bukti_id,
  t.id as tagihan_id,
  t.penghuni_id,
  t.jenis,
  case when t.jenis = 'B' then 'kos' else 'pemilik' end as kas,
  t.total as nominal,
  b.diverifikasi_at::date as tanggal
from bukti_pembayaran b
join tagihan t on t.id = b.tagihan_id
where b.status = 'disetujui';

-- ===== Notifikasi =====
create table if not exists notifikasi (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  judul text not null,
  isi text,
  dibaca boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifikasi_user on notifikasi (user_id, dibaca);

-- ===== Keamanan: RLS aktif tanpa policy =====
alter table users enable row level security;
alter table kode_verifikasi enable row level security;
alter table kamar enable row level security;
alter table penghuni enable row level security;
alter table komponen_tagihan enable row level security;
alter table rekening_tujuan enable row level security;
alter table pengaturan enable row level security;
alter table tagihan enable row level security;
alter table tagihan_item enable row level security;
alter table bukti_pembayaran enable row level security;
alter table pengeluaran enable row level security;
alter table notifikasi enable row level security;

-- ===== Storage privat untuk foto bukti transfer =====
insert into storage.buckets (id, name, public)
values ('bukti-pembayaran', 'bukti-pembayaran', false)
on conflict (id) do nothing;

-- Muat ulang cache skema API Supabase
notify pgrst, 'reload schema';
-- Migrasi 002: nama pengirim hasil OCR
alter table bukti_pembayaran add column if not exists nama_pengirim text;

-- Migrasi 003: versi sesi (dicabut saat password diganti)
alter table users add column if not exists token_versi int not null default 0;

-- Migrasi 004: jejak item tagihan (denda manual)
alter table tagihan_item add column if not exists created_at timestamptz not null default now();
alter table tagihan_item add column if not exists dicatat_oleh uuid references users(id);
