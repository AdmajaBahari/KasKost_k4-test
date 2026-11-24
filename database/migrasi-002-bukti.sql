alter table bukti_pembayaran add column if not exists nama_pengirim text;
notify pgrst, 'reload schema';