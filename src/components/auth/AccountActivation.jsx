import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle, XCircle, Spinner } from 'phosphor-react';
import { supabase } from '../../lib/supabase';

export default function AccountActivation() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading, success, error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let isMounted = true;
    let redirectTimeout = null;

    const verifyActivation = async () => {
      try {
        const tokenHash = searchParams.get('token_hash') || searchParams.get('token');
        const type = searchParams.get('type') || 'signup';
        const code = searchParams.get('code');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          });
          if (error) throw error;
        } else {
          // Check if Supabase already processed hash fragment tokens automatically
          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session) {
            if (!isMounted) return;
            setStatus('error');
            setMessage("Lien d'activation invalide ou expiré.");
            return;
          }
        }

        if (!isMounted) return;
        setStatus('success');
        setMessage('Votre compte a été activé avec succès !');

        redirectTimeout = setTimeout(() => {
          navigate('/inscription', { replace: true });
        }, 2500);
      } catch (error) {
        console.error('Account activation error:', error);
        if (!isMounted) return;
        setStatus('error');
        setMessage(
          error.message || "Une erreur est survenue lors de l'activation de votre compte."
        );
      }
    };

    verifyActivation();

    return () => {
      isMounted = false;
      if (redirectTimeout) clearTimeout(redirectTimeout);
    };
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 space-y-8">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 mb-4">
            Activation du compte
          </h2>

          <div className="flex justify-center mb-6">
            {status === 'loading' && (
              <Spinner size={48} className="animate-spin text-blue-600" />
            )}
            {status === 'success' && (
              <CheckCircle size={48} className="text-green-600" />
            )}
            {status === 'error' && (
              <XCircle size={48} className="text-red-600" />
            )}
          </div>

          <p
            className={`text-lg ${
              status === 'loading'
                ? 'text-gray-600'
                : status === 'success'
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {status === 'loading' ? 'Vérification de votre compte...' : message}
          </p>

          {status === 'error' && (
            <button
              onClick={() => navigate('/inscription')}
              className="mt-6 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            >
              Retour à l'inscription
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
