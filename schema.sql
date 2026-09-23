-- Tikoun · schéma Supabase (à coller dans SQL Editor → Run). Réexécutable sans risque.

-- 1. Données : un document JSON par élément (classe, cours, contrôle, feuilles de copies…)
create table if not exists public.docs (
  path        text primary key,
  col         text not null,
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create index if not exists docs_col_idx on public.docs (col);

-- Fusion profonde de deux objets JSON (mises à jour partielles sans écraser le travail d'un collègue)
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb)
returns jsonb language plpgsql immutable as $$
declare k text; res jsonb;
begin
  if a is null or b is null or jsonb_typeof(a) <> 'object' or jsonb_typeof(b) <> 'object' then
    return b;
  end if;
  res := a;
  for k in select jsonb_object_keys(b) loop
    res := jsonb_set(res, array[k], public.jsonb_deep_merge(res -> k, b -> k), true);
  end loop;
  return res;
end $$;

create or replace function public.tk_update(p_path text, p_patch jsonb)
returns void language plpgsql security invoker as $$
begin
  update public.docs
     set data = public.jsonb_deep_merge(data, p_patch), updated_at = now(), updated_by = auth.uid()
   where path = p_path;
  if not found then raise exception 'document introuvable : %', p_path using errcode = 'P0002'; end if;
end $$;

-- 2. Accès : uniquement les professeurs connectés (comptes créés par l'administrateur)
alter table public.docs enable row level security;
drop policy if exists "tk_select" on public.docs;
drop policy if exists "tk_insert" on public.docs;
drop policy if exists "tk_update" on public.docs;
drop policy if exists "tk_delete" on public.docs;
create policy "tk_select" on public.docs for select to authenticated using (true);
create policy "tk_insert" on public.docs for insert to authenticated with check (true);
create policy "tk_update" on public.docs for update to authenticated using (true) with check (true);
create policy "tk_delete" on public.docs for delete to authenticated using (true);
revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant execute on function public.tk_update(text, jsonb) to authenticated;
revoke execute on function public.tk_update(text, jsonb) from anon, public;

-- 3. Temps réel : les écrans des collègues se mettent à jour tout seuls
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4. Photos des copies : bucket privé
insert into storage.buckets (id, name, public) values ('tikoun', 'tikoun', false)
on conflict (id) do nothing;
drop policy if exists "tk_files_read" on storage.objects;
drop policy if exists "tk_files_add" on storage.objects;
drop policy if exists "tk_files_update" on storage.objects;
create policy "tk_files_read"   on storage.objects for select to authenticated using (bucket_id = 'tikoun');
create policy "tk_files_add"    on storage.objects for insert to authenticated with check (bucket_id = 'tikoun');
create policy "tk_files_update" on storage.objects for update to authenticated using (bucket_id = 'tikoun');
