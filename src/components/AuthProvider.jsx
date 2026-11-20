import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { supabase } from '../lib/supabase';
import { ensureUserProfile } from '../lib/authHelpers';
import { updateUser, clearUser, setAuthInitialized } from '../store/slices/userSlice';

export default function AuthProvider({ children }) {
  const dispatch = useDispatch();

  useEffect(() => {
    let isMounted = true;

    const syncSessionUser = async (session) => {
      if (!isMounted) return;

      if (!session?.user) {
        dispatch(clearUser());
        return;
      }

      try {
        const userData = await ensureUserProfile(session.user);
        if (!isMounted) return;

        dispatch(
          updateUser({
            id: userData.id,
            email: userData.email,
            name: userData.full_name,
            role: userData.role,
            avatar: userData.avatar,
            ...(userData.language ? { language: userData.language } : {}),
            isAuthenticated: true,
          })
        );
      } catch (error) {
        console.error('Error fetching user profile:', error);
        if (!isMounted) return;
        dispatch(clearUser());
      }
    };

    const initSession = async () => {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) throw sessionError;
        await syncSessionUser(session);
      } catch (error) {
        console.error('Error checking session:', error);
        if (isMounted) {
          dispatch(clearUser());
        }
      } finally {
        if (isMounted) {
          dispatch(setAuthInitialized(true));
        }
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT' || !session) {
        dispatch(clearUser());
        dispatch(setAuthInitialized(true));
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        // Defer Supabase DB queries outside the auth state callback to avoid auth lock contention
        setTimeout(() => {
          syncSessionUser(session).finally(() => {
            if (isMounted) {
              dispatch(setAuthInitialized(true));
            }
          });
        }, 0);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [dispatch]);

  return children;
}
