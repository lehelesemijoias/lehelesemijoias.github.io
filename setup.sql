-- =====================================================================
--  VITRINE LE HELÊ — configuração do banco de dados no Supabase
--  Como usar: Supabase > SQL Editor > New query > cole TUDO > Run.
--  Pode rodar de novo sem problema (o script não apaga nada).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) QUEM PODE MEXER NO PAINEL
--    Troque o e-mail abaixo pelo e-mail que vai entrar no painel.
--    Para mais de uma pessoa, repita a linha com cada e-mail.
-- ---------------------------------------------------------------------
create table if not exists public.admins (email text primary key);

insert into public.admins (email) values ('lehelesemijoias@gmail.com') on conflict do nothing;
-- insert into public.admins (email) values ('outro-email@exemplo.com') on conflict do nothing;


-- ---------------------------------------------------------------------
-- 2) TABELAS
-- ---------------------------------------------------------------------
create table if not exists public.pecas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  codigo        text not null default '',
  categoria     text not null default '',
  banho         text not null default '',
  valor         integer,                               -- em centavos (R$ 48,00 = 4800)
  descricao     text not null default '',
  fotos         jsonb not null default '[]'::jsonb,    -- [{ "full": "...", "thumb": "..." }]
  arquivada     boolean not null default false,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.config (
  id            integer primary key default 1 check (id = 1),
  colecao       text not null default '',
  whatsapp      text not null default '',
  instagram     text not null default '',
  ordem_cats    jsonb not null default '[]'::jsonb,
  atualizado_em timestamptz not null default now()
);
insert into public.config (id) values (1) on conflict do nothing;


-- ---------------------------------------------------------------------
-- 3) FUNÇÃO "é administrador?"
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 4) AVISO DE ATUALIZAÇÃO
--    Toda vez que uma peça muda, a linha de config é "tocada".
--    A vitrine das clientes escuta isso e se atualiza sozinha.
-- ---------------------------------------------------------------------
create or replace function public.avisar_vitrine()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update public.config set atualizado_em = now() where id = 1;
  return null;
end;
$$;

drop trigger if exists pecas_avisar_vitrine on public.pecas;
create trigger pecas_avisar_vitrine
after insert or update or delete on public.pecas
for each statement execute function public.avisar_vitrine();


-- ---------------------------------------------------------------------
-- 5) SEGURANÇA (quem lê e quem escreve)
--    Clientes: só leem peças NÃO arquivadas e os ajustes.
--    Administradores: fazem tudo.
-- ---------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.pecas  enable row level security;
alter table public.config enable row level security;

drop policy if exists "admins leem admins" on public.admins;
create policy "admins leem admins" on public.admins
  for select to authenticated using (public.is_admin());

drop policy if exists "vitrine le pecas" on public.pecas;
create policy "vitrine le pecas" on public.pecas
  for select to anon, authenticated using (arquivada = false or public.is_admin());

drop policy if exists "admin cria pecas" on public.pecas;
create policy "admin cria pecas" on public.pecas
  for insert to authenticated with check (public.is_admin());

drop policy if exists "admin altera pecas" on public.pecas;
create policy "admin altera pecas" on public.pecas
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin apaga pecas" on public.pecas;
create policy "admin apaga pecas" on public.pecas
  for delete to authenticated using (public.is_admin());

drop policy if exists "todos leem config" on public.config;
create policy "todos leem config" on public.config
  for select to anon, authenticated using (true);

drop policy if exists "admin altera config" on public.config;
create policy "admin altera config" on public.config
  for update to authenticated using (public.is_admin()) with check (public.is_admin());


-- Permissões de acesso às tabelas (as regras acima continuam valendo)
grant usage on schema public to anon, authenticated;
grant select on public.pecas, public.config to anon;
grant select, insert, update, delete on public.pecas to authenticated;
grant select, update on public.config to authenticated;
grant select on public.admins to authenticated;


-- ---------------------------------------------------------------------
-- 6) FOTOS (Storage) — pasta pública "fotos"
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true;

drop policy if exists "admin envia fotos" on storage.objects;
create policy "admin envia fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "admin ve fotos" on storage.objects;
create policy "admin ve fotos" on storage.objects
  for select to authenticated using (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "admin altera fotos" on storage.objects;
create policy "admin altera fotos" on storage.objects
  for update to authenticated using (bucket_id = 'fotos' and public.is_admin());

drop policy if exists "admin apaga fotos" on storage.objects;
create policy "admin apaga fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and public.is_admin());


-- ---------------------------------------------------------------------
-- 7) TEMPO REAL — a vitrine é avisada na hora quando algo muda
-- ---------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.config;
  exception when duplicate_object then null;
  end;
end $$;

-- Pronto! Deve aparecer "Success. No rows returned".
