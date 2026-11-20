import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SignOut } from 'phosphor-react';
import { useDispatch } from 'react-redux';
import { clearUser } from '../../store/slices/userSlice';
import { supabase } from '../../lib/supabase';

export default function DisconnectSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleDisconnect = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      dispatch(clearUser());
      setIsSigningOut(false);
      navigate('/inscription', { replace: true });
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-4 sm:p-6 mt-6">
      <div className="flex items-center mb-4">
        <SignOut size={24} className="text-red-600 mr-2 sm:mr-3" />
        <h2 className="text-base sm:text-lg font-semibold text-gray-800">{t('settings.disconnect.title')}</h2>
      </div>
      <div className="ml-7 sm:ml-9">
        <p className="text-xs sm:text-sm text-gray-600 mb-4">{t('settings.disconnect.description')}</p>
        <button
          onClick={handleDisconnect}
          disabled={isSigningOut}
          className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs sm:text-sm font-medium hover:bg-red-100 transition-colors w-full sm:w-auto disabled:opacity-50"
        >
          {t('settings.disconnect.button')}
        </button>
      </div>
    </div>
  );
}
