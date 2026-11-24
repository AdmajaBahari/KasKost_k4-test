alter table users add column if not exists token_versi int not null default 0;
notify pgrst, 'reload schema';