# Panduan rilis KasKost

## 1. Supabase
- Buat **secret key baru**, pakai untuk server produksi, lalu hapus key lama (Project Settings → API Keys).
- Pastikan RLS aktif di semua tabel dan bucket `bukti-pembayaran` berstatus **private** (sudah dari skema).
- Hapus data uji (`delete from tagihan; delete from bukti_pembayaran;` dst.) dan akun uji (`*@kaskost.test`).
- Isi `rekening_tujuan` dan `komponen_tagihan` dengan data asli (`database/seed.sql` hanya contoh).

## 2. Variabel lingkungan (di panel hosting, bukan di Git)
| Nama | Isi |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | biasanya diisi otomatis oleh hosting |
| `SUPABASE_URL`, `SUPABASE_SECRET_KEY` | dari dashboard Supabase |
| `SESSION_SECRET` | string acak panjang, **berbeda** dari di laptop |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | dari Google AI Studio |
| `TRUST_PROXY` | `1` jika di belakang proxy/load balancer |
| `JOB_KEY` | string acak minimal 16 karakter (untuk penjadwal luar) |
| `MAIL_PROVIDER`, `MAIL_FROM` | `resend` atau `smtp`, alamat pengirim |
| `RESEND_API_KEY` atau `SMTP_HOST/PORT/USER/PASS` | sesuai pilihan |

Buat string acak: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 3. Menjalankan
npm ci --omit=dev
node src/app.js
Aplikasi **wajib lewat HTTPS** (cookie sesi bertanda `secure` di production).

## 4. Job tagihan, denda, pengingat
Berjalan otomatis saat server menyala dan tiap jam. Jika hosting menidurkan server saat sepi,
panggil dari penjadwal luar (mis. cron-job.org) tiap jam:
POST https://domain-anda/internal/job
Header: x-job-key: <JOB_KEY>

## 6. Daftar periksa sebelum dibuka ke penghuni
- [ ] `.env` tidak ada di Git (`git ls-files | findstr .env` hanya menampilkan `.env.example`)
- [ ] Email verifikasi benar-benar sampai (daftar dengan email asli)
- [ ] Login salah 9 kali -> muncul pembatasan
- [ ] Unggah bukti, OCR, dan antrean verifikasi berjalan end-to-end
- [ ] `npm audit` tanpa temuan tingkat tinggi
- [ ] Cadangan database aktif (Supabase → Database → Backups)

## 7. Pemeliharaan
- Perbarui dependensi dan jalankan `npm audit` berkala.
- Putar (rotasi) secret key Supabase dan `SESSION_SECRET` bila ada kebocoran. Mengganti `SESSION_SECRET` membuat semua pengguna login ulang.