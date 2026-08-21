-- =============================================================================
-- Esquema de la membresía mensual — Verificador Hacienda CR
-- =============================================================================
--
-- Ejecute este archivo una sola vez en el SQL Editor de su proyecto Supabase
-- (https://supabase.com/dashboard/project/_/sql/new) antes de reemplazar
-- SUPABASE_URL/SUPABASE_ANON_KEY en index.html.
--
-- Requiere que en el proyecto esté habilitada la confirmación de correo
-- (Authentication → Providers → Email → "Confirm email"), que es el
-- comportamiento por defecto de Supabase.
--
-- La seguridad real de los datos vive aquí, no en el "anon key" del cliente:
-- todas las tablas tienen Row Level Security activado y cada política se
-- explica en el comentario que la precede.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tablas
-- -----------------------------------------------------------------------------

create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  nombre_completo        text not null default '',
  cedula                 text not null default '',
  telefono               text not null default '',
  requiere_factura       boolean not null default false,
  direccion_exacta       text,
  actividad_economica    text,
  role                   text not null default 'member' check (role in ('member', 'admin')),
  membership_expires_at  timestamptz,
  created_at             timestamptz not null default now()
);

comment on table public.profiles is
  'Un perfil por usuario de auth.users. Se crea automáticamente vía el disparador '
  'on_auth_user_created (ver más abajo) a partir de los metadatos enviados en signUp().';

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  medio               text not null check (medio in ('transferencia', 'deposito', 'sinpe')),
  referencia          text not null,
  monto               numeric not null default 5000,
  estado              text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'rechazado')),
  periodo_fin         timestamptz,
  confirmado_por      uuid references public.profiles(id),
  fecha_envio         timestamptz not null default now(),
  fecha_confirmacion  timestamptz
);

create index payments_user_id_idx on public.payments(user_id);
create index payments_estado_idx on public.payments(estado);

-- -----------------------------------------------------------------------------
-- 2. Alta automática de perfil al registrarse
-- -----------------------------------------------------------------------------
--
-- Con "Confirm email" activo, signUp() no deja al cliente autenticado hasta
-- que la persona confirma el correo — por lo que un INSERT hecho desde el
-- navegador justo después de signUp() no tendría auth.uid() y RLS lo
-- rechazaría. La alternativa estándar de Supabase es este disparador,
-- ejecutado con privilegios de servidor, que lee los datos que el registro
-- envió como metadatos (options.data en signUp) y crea el perfil sin
-- depender de que exista sesión.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nombre_completo, cedula, telefono, requiere_factura, direccion_exacta, actividad_economica)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nombre_completo', ''),
    coalesce(new.raw_user_meta_data->>'cedula', ''),
    coalesce(new.raw_user_meta_data->>'telefono', ''),
    coalesce((new.raw_user_meta_data->>'requiere_factura')::boolean, false),
    new.raw_user_meta_data->>'direccion_exacta',
    new.raw_user_meta_data->>'actividad_economica'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 3. Confirmación/rechazo de pagos (sólo administradores)
-- -----------------------------------------------------------------------------
--
-- Centraliza aquí la regla de cálculo del nuevo vencimiento (Supuesto 3 de
-- la especificación): si la membresía aún estaba vigente, el nuevo período
-- se cuenta desde el vencimiento anterior (mantiene el calendario alineado);
-- si ya había vencido, se cuenta desde el momento de la confirmación.
--
-- security definer + la comprobación de rol adentro de la función es lo que
-- hace posible que la contraseña admin pública de la aplicación (un simple
-- interruptor de visibilidad, ver README §12) revele el panel sin que eso
-- signifique acceso real: aunque alguien vea el botón "Confirmar", la
-- llamada sólo hace efecto si SU sesión de Supabase tiene role='admin'.

create or replace function public.confirm_payment(payment_id uuid, aprobar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  es_admin boolean;
  v_user_id uuid;
  v_vencimiento_actual timestamptz;
  v_nuevo_vencimiento timestamptz;
begin
  select (role = 'admin') into es_admin from public.profiles where id = auth.uid();
  if not coalesce(es_admin, false) then
    raise exception 'Sólo un administrador puede confirmar o rechazar pagos';
  end if;

  select user_id into v_user_id from public.payments where id = payment_id and estado = 'pendiente';
  if v_user_id is null then
    raise exception 'El pago no existe o ya fue resuelto';
  end if;

  if not aprobar then
    update public.payments
       set estado = 'rechazado', confirmado_por = auth.uid(), fecha_confirmacion = now()
     where id = payment_id;
    return;
  end if;

  select membership_expires_at into v_vencimiento_actual from public.profiles where id = v_user_id;
  v_nuevo_vencimiento := (case
    when v_vencimiento_actual is not null and v_vencimiento_actual > now() then v_vencimiento_actual
    else now()
  end) + interval '1 month';

  update public.payments
     set estado = 'confirmado', confirmado_por = auth.uid(),
         fecha_confirmacion = now(), periodo_fin = v_nuevo_vencimiento
   where id = payment_id;

  update public.profiles
     set membership_expires_at = v_nuevo_vencimiento
   where id = v_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.payments enable row level security;

-- Una política de RLS sobre "profiles" no puede consultar "profiles" dentro
-- de su propia condición: Postgres la vuelve a evaluar para esa misma
-- subconsulta y entra en un ciclo infinito ("infinite recursion detected in
-- policy for relation profiles"). La salida estándar es aislar esa
-- comprobación en una función security definer: al correr con privilegios
-- de servidor, su SELECT interno no vuelve a pasar por RLS.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

grant execute on function public.is_admin() to authenticated;

-- profiles: cada quien ve su propio perfil; un admin ve todos.
create policy "profiles_select_propio_o_admin" on public.profiles
  for select using (
    auth.uid() = id
    or public.is_admin()
  );

-- profiles: nadie inserta desde el cliente (lo hace el disparador con
-- privilegios de servidor); no se declara política de INSERT, así que
-- queda denegado por defecto para el rol authenticated.

-- profiles: cada quien actualiza su propio perfil, pero NUNCA su rol ni su
-- fecha de vencimiento — eso sólo lo toca confirm_payment() o el panel de
-- Supabase. El permiso de columnas es lo que hace cumplir ese límite, no
-- sólo la política de fila.
create policy "profiles_update_propio" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

revoke update on public.profiles from authenticated;
grant update (nombre_completo, telefono, direccion_exacta, actividad_economica) on public.profiles to authenticated;

-- payments: cada quien inserta y ve sus propios pagos; un admin ve todos.
create policy "payments_insert_propio" on public.payments
  for insert with check (auth.uid() = user_id);

create policy "payments_select_propio_o_admin" on public.payments
  for select using (
    auth.uid() = user_id
    or public.is_admin()
  );

-- payments: nadie actualiza directamente (ni siquiera un admin) — el único
-- camino es confirm_payment(), que corre con privilegios de servidor y
-- valida el rol por su cuenta. No se declara política de UPDATE.

-- -----------------------------------------------------------------------------
-- 5. Primer administrador
-- -----------------------------------------------------------------------------
--
-- Ningún usuario puede autoasignarse el rol admin (ver el revoke/grant de
-- columnas arriba). Regístrese normalmente en la aplicación y luego, en el
-- SQL Editor, ejecute:
--
--   update public.profiles set role = 'admin' where id =
--     (select id from auth.users where email = 'correo@ejemplo.com');
