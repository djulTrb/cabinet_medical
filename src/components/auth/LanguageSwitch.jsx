import React from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import { updateLanguage } from '../../store/slices/userSlice';
import { Globe } from 'phosphor-react';

const LanguageSwitch = () => {
  const { i18n } = useTranslation();
  const dispatch = useDispatch();
  const isArabic = i18n.language?.startsWith('ar');

  const handleLanguageChange = () => {
    const newLang = isArabic ? 'fr' : 'ar';
    i18n.changeLanguage(newLang);
    dispatch(updateLanguage(newLang));
  };

  return (
    <button
      type="button"
      onClick={handleLanguageChange}
      className="flex items-center space-x-2 px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors"
    >
      <Globe size={20} />
      <span className="font-medium">{isArabic ? 'FR' : 'AR'}</span>
    </button>
  );
};

export default LanguageSwitch;
