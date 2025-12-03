-- =========================
-- 1) CLIENTES (sensível)
-- =========================
-- View pública SEM telefone (recriar sem security definer)
drop view if exists public.clientes_kiosk;
create view public.clientes_kiosk as
select
  id,
  nome,
  mercadinho_id,
  ativo
from public.clientes
where ativo = true;

-- RLS ON e sem SELECT público em clientes
alter table public.clientes enable row level security;

drop policy if exists "clientes_somente_admin_select" on public.clientes;
drop policy if exists "clientes_admin_all" on public.clientes;
drop policy if exists "clientes_select_anon" on public.clientes;
drop policy if exists "clientes_anon_select" on public.clientes;
drop policy if exists "clientes_anon_all" on public.clientes;
drop policy if exists "clientes_somente_admin_all" on public.clientes;

create policy "clientes_admin_all"
on public.clientes
for all
to authenticated
using (true)
with check (true);

-- =========================
-- 2) PINS (sensível)
-- =========================
-- Fechar SELECT público totalmente (anon NÃO lê pins)
alter table public.pins enable row level security;

drop policy if exists "pins_anon_select" on public.pins;
drop policy if exists "pins_anon_insert" on public.pins;
drop policy if exists "pins_admin_all" on public.pins;

-- somente admin autenticado pode ver/editar pins
create policy "pins_admin_all"
on public.pins
for all
to authenticated
using (true)
with check (true);

-- =========================
-- 3) COMPRAS e ITENS (sensível)
-- =========================
alter table public.compras enable row level security;
alter table public.itens_compra enable row level security;

drop policy if exists "compras_anon_insert" on public.compras;
drop policy if exists "itens_anon_insert" on public.itens_compra;
drop policy if exists "compras_admin_all" on public.compras;
drop policy if exists "itens_admin_all" on public.itens_compra;

-- anon só pode INSERIR
create policy "compras_anon_insert"
on public.compras
for insert
to anon
with check (true);

create policy "itens_anon_insert"
on public.itens_compra
for insert
to anon
with check (true);

-- admin autenticado pode tudo
create policy "compras_admin_all"
on public.compras
for all
to authenticated
using (true)
with check (true);

create policy "itens_admin_all"
on public.itens_compra
for all
to authenticated
using (true)
with check (true);

-- =========================
-- 4) RLS nas tabelas públicas do totem
-- (para remover "RLS Disabled in Public")
-- =========================

-- PRODUTOS (público para leitura)
alter table public.produtos enable row level security;
drop policy if exists "produtos_select_anon" on public.produtos;
drop policy if exists "produtos_admin_all" on public.produtos;

create policy "produtos_select_anon"
on public.produtos
for select
to anon
using (ativo = true);

create policy "produtos_admin_all"
on public.produtos
for all
to authenticated
using (true)
with check (true);

-- MERCADINHOS (público para leitura)
alter table public.mercadinhos enable row level security;
drop policy if exists "mercadinhos_select_anon" on public.mercadinhos;
drop policy if exists "mercadinhos_admin_all" on public.mercadinhos;

create policy "mercadinhos_select_anon"
on public.mercadinhos
for select
to anon
using (true);

create policy "mercadinhos_admin_all"
on public.mercadinhos
for all
to authenticated
using (true)
with check (true);

-- TABLETS (público para leitura)
alter table public.tablets enable row level security;
drop policy if exists "tablets_select_anon" on public.tablets;
drop policy if exists "tablets_admin_all" on public.tablets;

create policy "tablets_select_anon"
on public.tablets
for select
to anon
using (true);

create policy "tablets_admin_all"
on public.tablets
for all
to authenticated
using (true)
with check (true);

-- PROMOCOES (público para leitura)
alter table public.promocoes enable row level security;
drop policy if exists "promocoes_select_anon" on public.promocoes;
drop policy if exists "promocoes_admin_all" on public.promocoes;

create policy "promocoes_select_anon"
on public.promocoes
for select
to anon
using (ativa = true);

create policy "promocoes_admin_all"
on public.promocoes
for all
to authenticated
using (true)
with check (true);

-- TELA_DESCANSO (público para leitura)
alter table public.tela_descanso enable row level security;
drop policy if exists "tela_descanso_select_anon" on public.tela_descanso;
drop policy if exists "tela_descanso_admin_all" on public.tela_descanso;

create policy "tela_descanso_select_anon"
on public.tela_descanso
for select
to anon
using (ativa = true);

create policy "tela_descanso_admin_all"
on public.tela_descanso
for all
to authenticated
using (true)
with check (true);

-- LOTES_PRODUTOS (somente admin; não expor validade publicamente)
alter table public.lotes_produtos enable row level security;
drop policy if exists "lotes_admin_all" on public.lotes_produtos;

create policy "lotes_admin_all"
on public.lotes_produtos
for all
to authenticated
using (true)
with check (true);