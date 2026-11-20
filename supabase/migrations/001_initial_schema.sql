-- ============================================================================
-- Cabinet Medical Platform - Complete Supabase Database Schema & RLS Policies
-- ============================================================================
-- Run this entire script in your Supabase project's SQL Editor.
-- It is safe to re-run (idempotent).
-- ============================================================================

-- 1. Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Tables
-- ----------------------------------------------------------------------------

-- Profiles table (linked 1-to-1 with auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  avatar text,
  role text NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'doctor')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Announcements table (camelCase "idAnnonce" matches frontend & schema)
CREATE TABLE IF NOT EXISTS public.annonces (
  "idAnnonce" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  titre text NOT NULL,
  contenu text NOT NULL,
  photo text
);

-- Blocked time slots table
CREATE TABLE IF NOT EXISTS public.creneaux_bloques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  heure int4 NOT NULL DEFAULT 0,
  minutes int4 NOT NULL DEFAULT 0,
  type_blocage varchar NOT NULL CHECK (type_blocage IN ('jour', 'heure')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creneaux_bloques_unique_slot UNIQUE (date, heure, minutes, type_blocage)
);

-- Appointments table
CREATE TABLE IF NOT EXISTS public.rendez_vous (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  patient_full_name varchar,
  date_heure timestamp NOT NULL,
  type_rendez_vous text NOT NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'accepte', 'refuse', 'annule')),
  note text,
  telephone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rendez_vous_patient_id_fkey FOREIGN KEY (patient_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

-- Prevent double-booking of active (pending or accepted) appointment slots
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_appointment_slot
  ON public.rendez_vous (date_heure)
  WHERE statut IN ('en_attente', 'accepte');

CREATE INDEX IF NOT EXISTS idx_rendez_vous_patient_id ON public.rendez_vous (patient_id);
CREATE INDEX IF NOT EXISTS idx_rendez_vous_statut ON public.rendez_vous (statut);
CREATE INDEX IF NOT EXISTS idx_creneaux_bloques_date ON public.creneaux_bloques (date);

-- 3. Utility & Security Functions
-- ----------------------------------------------------------------------------

-- Automatic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_creneaux_bloques_updated_at ON public.creneaux_bloques;
CREATE TRIGGER trg_creneaux_bloques_updated_at
  BEFORE UPDATE ON public.creneaux_bloques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_rendez_vous_updated_at ON public.rendez_vous;
CREATE TRIGGER trg_rendez_vous_updated_at
  BEFORE UPDATE ON public.rendez_vous
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: check if current authenticated user is a doctor (SECURITY DEFINER avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_doctor()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'doctor'
  );
$$;

-- Helper: get current user's role safely without RLS recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid();
$$;

-- Secure RPC: return occupied appointment timestamps without exposing other patients' personal data
CREATE OR REPLACE FUNCTION public.get_booked_slots()
RETURNS TABLE (date_heure timestamp, statut text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rv.date_heure, rv.statut
  FROM public.rendez_vous rv
  WHERE auth.uid() IS NOT NULL
    AND rv.statut IN ('en_attente', 'accepte');
$$;

REVOKE ALL ON FUNCTION public.get_booked_slots() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_booked_slots() TO authenticated;

-- Trigger: automatically create a profile row whenever a new auth user signs up
-- (works seamlessly even when Supabase email confirmation is enabled)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_role text;
BEGIN
  IF lower(COALESCE(NEW.email, '')) = 'cabinetmedical2025@cab.med' THEN
    assigned_role := 'doctor';
  ELSE
    assigned_role := 'patient';
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, avatar, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    assigned_role,
    NULL,
    NULL
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE
      WHEN COALESCE(public.profiles.full_name, '') = '' THEN EXCLUDED.full_name
      ELSE public.profiles.full_name
    END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profiles for any already-existing auth.users rows
INSERT INTO public.profiles (id, email, full_name, role)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  CASE
    WHEN lower(COALESCE(u.email, '')) = 'cabinetmedical2025@cab.med' THEN 'doctor'
    ELSE 'patient'
  END
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- 4. Row-Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creneaux_bloques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rendez_vous ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
DROP POLICY IF EXISTS "profiles_select_own_or_doctor" ON public.profiles;
CREATE POLICY "profiles_select_own_or_doctor"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_doctor());

DROP POLICY IF EXISTS "profiles_insert_own_patient" ON public.profiles;
CREATE POLICY "profiles_insert_own_patient"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'patient');

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = public.get_my_role());

-- ANNONCES policies
DROP POLICY IF EXISTS "annonces_select_authenticated" ON public.annonces;
CREATE POLICY "annonces_select_authenticated"
  ON public.annonces FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "annonces_insert_doctor" ON public.annonces;
CREATE POLICY "annonces_insert_doctor"
  ON public.annonces FOR INSERT
  TO authenticated
  WITH CHECK (public.is_doctor());

DROP POLICY IF EXISTS "annonces_update_doctor" ON public.annonces;
CREATE POLICY "annonces_update_doctor"
  ON public.annonces FOR UPDATE
  TO authenticated
  USING (public.is_doctor())
  WITH CHECK (public.is_doctor());

DROP POLICY IF EXISTS "annonces_delete_doctor" ON public.annonces;
CREATE POLICY "annonces_delete_doctor"
  ON public.annonces FOR DELETE
  TO authenticated
  USING (public.is_doctor());

-- CRENEAUX_BLOQUES policies
DROP POLICY IF EXISTS "creneaux_bloques_select_authenticated" ON public.creneaux_bloques;
CREATE POLICY "creneaux_bloques_select_authenticated"
  ON public.creneaux_bloques FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "creneaux_bloques_insert_doctor" ON public.creneaux_bloques;
CREATE POLICY "creneaux_bloques_insert_doctor"
  ON public.creneaux_bloques FOR INSERT
  TO authenticated
  WITH CHECK (public.is_doctor());

DROP POLICY IF EXISTS "creneaux_bloques_update_doctor" ON public.creneaux_bloques;
CREATE POLICY "creneaux_bloques_update_doctor"
  ON public.creneaux_bloques FOR UPDATE
  TO authenticated
  USING (public.is_doctor())
  WITH CHECK (public.is_doctor());

DROP POLICY IF EXISTS "creneaux_bloques_delete_doctor" ON public.creneaux_bloques;
CREATE POLICY "creneaux_bloques_delete_doctor"
  ON public.creneaux_bloques FOR DELETE
  TO authenticated
  USING (public.is_doctor());

-- RENDEZ_VOUS policies
DROP POLICY IF EXISTS "rendez_vous_select_own_or_doctor" ON public.rendez_vous;
CREATE POLICY "rendez_vous_select_own_or_doctor"
  ON public.rendez_vous FOR SELECT
  TO authenticated
  USING (patient_id = auth.uid() OR public.is_doctor());

DROP POLICY IF EXISTS "rendez_vous_insert_patient_or_doctor" ON public.rendez_vous;
CREATE POLICY "rendez_vous_insert_patient_or_doctor"
  ON public.rendez_vous FOR INSERT
  TO authenticated
  WITH CHECK (
    (patient_id = auth.uid() AND statut = 'en_attente')
    OR public.is_doctor()
  );

DROP POLICY IF EXISTS "rendez_vous_update_doctor" ON public.rendez_vous;
CREATE POLICY "rendez_vous_update_doctor"
  ON public.rendez_vous FOR UPDATE
  TO authenticated
  USING (public.is_doctor())
  WITH CHECK (public.is_doctor());

DROP POLICY IF EXISTS "rendez_vous_delete_own_pending_refused_or_doctor" ON public.rendez_vous;
CREATE POLICY "rendez_vous_delete_own_pending_refused_or_doctor"
  ON public.rendez_vous FOR DELETE
  TO authenticated
  USING (
    public.is_doctor()
    OR (patient_id = auth.uid() AND statut IN ('en_attente', 'refuse'))
  );

-- ============================================================================
-- OPTIONAL: If you use a different doctor email than cabinetmedical2025@cab.med,
-- create that user in Supabase Auth (Authentication -> Users -> Add user),
-- then run:
--   UPDATE public.profiles SET role = 'doctor' WHERE email = 'your-doctor@email.com';
-- ============================================================================
