import { supabase } from './supabase';

const DOCTOR_EMAIL = (import.meta.env.VITE_DOCTOR_EMAIL || '').trim().toLowerCase();

export const normalizeRole = (role) => {
  const value = (role || '').toString().trim().toLowerCase();
  if (value === 'doctor' || value === 'médecin' || value === 'medecin' || value === 'طبيب') {
    return 'doctor';
  }
  return 'patient';
};

export const ensureUserProfile = async (authUser, fallbackFullName = '') => {
  if (!authUser?.id) {
    throw new Error('No authenticated user found');
  }

  const { data: existingProfile, error: selectError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  if (selectError) {
    throw selectError;
  }

  if (existingProfile) {
    return {
      id: existingProfile.id,
      email: existingProfile.email || authUser.email || '',
      full_name: existingProfile.full_name || authUser.user_metadata?.full_name || fallbackFullName || '',
      role: normalizeRole(existingProfile.role),
      avatar: existingProfile.avatar || existingProfile.avatar_url || null,
      language: existingProfile.language || null,
    };
  }

  // Profile row does not exist yet (e.g., first login after email confirmation without trigger).
  const email = (authUser.email || '').trim().toLowerCase();
  const isDoctorEmail = Boolean(DOCTOR_EMAIL && email === DOCTOR_EMAIL);
  const defaultRole = isDoctorEmail ? 'doctor' : 'patient';
  const defaultName =
    fallbackFullName ||
    authUser.user_metadata?.full_name ||
    (isDoctorEmail ? 'Médecin' : (authUser.email ? authUser.email.split('@')[0] : ''));

  const { data: createdProfile, error: upsertError } = await supabase
    .from('profiles')
    .upsert(
      [
        {
          id: authUser.id,
          email: authUser.email || '',
          full_name: defaultName,
          role: defaultRole,
          avatar: null,
          avatar_url: null,
        },
      ],
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (upsertError) {
    // Fallback to auth metadata if RLS restricts client-side profile creation
    console.warn('Could not auto-create profile row, falling back to auth metadata:', upsertError);
    return {
      id: authUser.id,
      email: authUser.email || '',
      full_name: defaultName,
      role: defaultRole,
      avatar: null,
      language: null,
    };
  }

  return {
    id: createdProfile.id,
    email: createdProfile.email || authUser.email || '',
    full_name: createdProfile.full_name || defaultName,
    role: normalizeRole(createdProfile.role),
    avatar: createdProfile.avatar || createdProfile.avatar_url || null,
    language: createdProfile.language || null,
  };
};
