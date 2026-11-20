import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useDispatch } from 'react-redux';
import { User, Envelope, Lock, ArrowLeft } from 'phosphor-react';
import { supabase } from '../../lib/supabase';
import { ensureUserProfile } from '../../lib/authHelpers';
import { updateUser } from '../../store/slices/userSlice';
import LanguageSwitch from './LanguageSwitch';

export default function PatientRegistration() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(true);
  const redirectTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm();

  const password = watch('password');

  const validatePassword = (value) => {
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumbers = /\d/.test(value);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(value);
    const isLongEnough = value.length >= 8;

    if (!isLongEnough || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
      return t('validation.passwordComplexity');
    }
    return true;
  };

  const onSubmit = async (data) => {
    setIsLoading(true);
    setError('');

    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      const trimmedName = data.fullName.trim();

      // Sign up with Supabase Auth (include user metadata so DB trigger populates profiles)
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password: data.password,
        options: {
          data: {
            full_name: trimmedName,
            role: 'patient',
          },
          emailRedirectTo: `${window.location.origin}/inscription`,
        },
      });

      if (signUpError) {
        console.error('Sign up error:', signUpError);
        const msg = (signUpError.message || '').toLowerCase();
        if (msg.includes('already registered') || msg.includes('already exists')) {
          setError(t('auth.emailAlreadyExists'));
        } else {
          setError(signUpError.message || t('auth.registrationError'));
        }
        return;
      }

      if (!authData?.user?.id) {
        setError(t('auth.registrationError'));
        return;
      }

      // Supabase returns empty identities array if email is already registered (when email confirmation is enabled)
      if (Array.isArray(authData.user.identities) && authData.user.identities.length === 0) {
        setError(t('auth.emailAlreadyExists'));
        return;
      }

      // If email confirmation is disabled, Supabase returns an active session right away
      if (authData.session) {
        const userData = await ensureUserProfile(authData.user, trimmedName);
        dispatch(
          updateUser({
            id: userData.id,
            email: userData.email,
            name: userData.full_name || trimmedName,
            role: userData.role,
            avatar: userData.avatar,
            isAuthenticated: true,
          })
        );
        setNeedsConfirmation(false);
        setSuccess(true);
        redirectTimerRef.current = setTimeout(() => {
          navigate('/agenda', { replace: true });
        }, 1500);
      } else {
        // Email confirmation is required: DB trigger creates the profile, and ensureUserProfile covers fallback on login
        setNeedsConfirmation(true);
        setSuccess(true);
        redirectTimerRef.current = setTimeout(() => {
          navigate('/inscription', { replace: true });
        }, 3000);
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || t('auth.registrationError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-8">
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={() => navigate('/inscription')}
            className="text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={24} />
          </button>
          <h2 className="text-3xl font-extrabold text-gray-900">
            {t('auth.registerAsPatient')}
          </h2>
          <LanguageSwitch />
        </div>
        <p className="text-center text-sm text-gray-600">
          {t('auth.patientRegistrationMessage')}
        </p>

        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">{error}</h3>
              </div>
            </div>
          </div>
        )}

        {success ? (
          <div className="rounded-md bg-green-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  {t('auth.registrationSuccess')}
                </h3>
                {needsConfirmation && (
                  <p className="text-sm text-green-700 mt-1">
                    {t('auth.confirmationEmailSent')}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="rounded-md shadow-sm space-y-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('auth.fullName')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="fullName"
                    type="text"
                    autoComplete="name"
                    className={`appearance-none rounded-lg relative block w-full px-3 py-2 pl-10 border ${
                      errors.fullName ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder={t('auth.fullName')}
                    {...register('fullName', {
                      required: t('auth.fullNameRequired'),
                    })}
                  />
                </div>
                {errors.fullName && (
                  <p className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('auth.email')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Envelope className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    className={`appearance-none rounded-lg relative block w-full px-3 py-2 pl-10 border ${
                      errors.email ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="example@email.com"
                    {...register('email', {
                      required: t('auth.emailRequired'),
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t('auth.invalidEmail'),
                      },
                    })}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className={`appearance-none rounded-lg relative block w-full px-3 py-2 pl-10 border ${
                      errors.password ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="••••••••"
                    {...register('password', {
                      required: t('auth.passwordRequired'),
                      validate: validatePassword
                    })}
                  />
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  {t('auth.confirmPassword')}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    className={`appearance-none rounded-lg relative block w-full px-3 py-2 pl-10 border ${
                      errors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                    } placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm`}
                    placeholder="••••••••"
                    {...register('confirmPassword', {
                      required: t('auth.confirmPasswordRequired'),
                      validate: value => value === password || t('validation.passwordMismatch')
                    })}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? t('auth.registering') : t('auth.register')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
