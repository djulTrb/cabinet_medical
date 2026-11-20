import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import { supabase } from '../../lib/supabase';
import { Plus, X, Image } from 'phosphor-react';
import { motion, AnimatePresence } from 'motion/react';
import { useForm } from 'react-hook-form';
import imageCompression from 'browser-image-compression';

export default function Announcements() {
  const { t, i18n } = useTranslation();
  const userRole = (useSelector((state) => state.user.role) || '').toLowerCase();
  const isDoctor = userRole === 'doctor';
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    defaultValues: {
      titre: '',
      contenu: '',
      photo: ''
    }
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('annonces')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setAnnouncements(data || []);
    } catch (err) {
      console.error('Error fetching announcements:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAnnouncement = async (data) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const now = new Date();
      const announcementData = {
        titre: data.titre.trim(),
        contenu: data.contenu.trim(),
        photo: imagePreview || null,
        created_at: now.toISOString()
      };

      const { data: newData, error: insertError } = await supabase
        .from('annonces')
        .insert([announcementData])
        .select();

      if (insertError) throw insertError;

      setAnnouncements((prev) => [...(newData || []), ...prev]);
      setIsCreating(false);
      reset();
      setImagePreview(null);
    } catch (err) {
      console.error('Error creating announcement:', err);
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteAnnouncement = async (idAnnonce) => {
    if (deletingId) return;
    setDeletingId(idAnnonce);
    try {
      const { error: deleteError } = await supabase
        .from('annonces')
        .delete()
        .eq('idAnnonce', idAnnonce);

      if (deleteError) throw deleteError;

      setAnnouncements((prev) => prev.filter(ann => ann.idAnnonce !== idAnnonce));
    } catch (err) {
      console.error('Error deleting announcement:', err);
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(t('validation.fileTooLarge'));
      return;
    }

    try {
      const compressedFile = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
      });

      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(compressedFile);
    } catch (err) {
      console.error('Error processing image:', err);
      setError(err.message || t('validation.compressionError'));
    }
  };

  const locale = i18n.language?.startsWith('ar') ? 'ar-DZ' : 'fr-FR';

  if (loading) {
    return (
      <div className="w-full max-w-[2000px] mx-auto py-4 sm:py-6 px-2 sm:px-4 md:px-6">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-[2000px] mx-auto py-4 sm:py-6 px-2 sm:px-4 md:px-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">{t('announcements.error.title')}</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setError(null)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              {t('announcements.error.dismiss')}
            </button>
            <button
              onClick={fetchAnnouncements}
              className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
            >
              {t('announcements.error.retry')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[2000px] mx-auto py-4 sm:py-6 px-2 sm:px-4 md:px-6">
      {/* Header with Add Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1">
              {t('announcements.title')}
            </h1>
            <p className="text-gray-500 text-sm sm:text-base">
              {t('announcements.subtitle')}
            </p>
          </div>
        </div>
        {isDoctor && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2.5 border bg-stone-200 bg-opacity-50 border-stone-300 text-blue-500 font-bold rounded-xl text-sm font-medium w-full sm:w-auto justify-center sm:justify-start"
          >
            <Plus weight="bold" className="text-lg" />
            <span>{t('announcements.addButton')}</span>
          </button>
        )}
      </div>

      {/* Announcements List */}
      <div className="grid gap-4 sm:gap-6">
        {announcements.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-gray-500 text-lg">{t('announcements.noAnnouncements')}</p>
            {isDoctor && (
              <p className="text-gray-400 text-sm mt-2">{t('announcements.addAnnouncementHint')}</p>
            )}
          </div>
        ) : (
          announcements.map((announcement) => (
            <div key={announcement.idAnnonce} className="bg-white rounded-xl shadow-sm overflow-hidden">
              {announcement.photo && (
                <div className="p-4">
                  <div
                    className="w-96 h-64 rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setSelectedImage(announcement.photo)}
                  >
                    <img
                      src={announcement.photo}
                      alt={announcement.titre}
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              )}
              <div className="p-4">
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-gray-800 mb-1.5">
                        {announcement.titre}
                      </h3>
                      <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-wrap">
                        {announcement.contenu}
                      </p>
                    </div>
                    {isDoctor && (
                      <button
                        onClick={() => handleDeleteAnnouncement(announcement.idAnnonce)}
                        disabled={deletingId === announcement.idAnnonce}
                        className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium shrink-0 disabled:opacity-50"
                      >
                        {t('announcements.card.delete')}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>
                      {new Date(announcement.created_at).toLocaleString(locale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Image Preview Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-4xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
              >
                <X weight="bold" className="text-2xl" />
              </button>
              <img
                src={selectedImage}
                alt="Preview"
                className="w-full h-auto max-h-[80vh] object-contain rounded-lg"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {isCreating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-800">
                  {t('announcements.addModal.title')}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(false);
                    reset();
                    setImagePreview(null);
                  }}
                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <X weight="bold" className="text-xl" />
                </button>
              </div>
              <form onSubmit={handleSubmit(handleCreateAnnouncement)} className="flex flex-col h-full">
                <div className="flex-1 p-3 sm:p-6 space-y-3 sm:space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('announcements.addModal.titleLabel')}
                    </label>
                    <input
                      {...register('titre', {
                        required: t('announcements.addModal.titleRequired'),
                        maxLength: {
                          value: 150,
                          message: t('announcements.addModal.titleTooLong')
                        }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm sm:text-base"
                      placeholder={t('announcements.addModal.titlePlaceholder')}
                    />
                    {errors.titre && (
                      <p className="mt-1 text-sm text-red-600">{errors.titre.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('announcements.addModal.contentLabel')}
                    </label>
                    <textarea
                      {...register('contenu', {
                        required: t('announcements.addModal.contentRequired'),
                        maxLength: {
                          value: 3000,
                          message: t('announcements.addModal.contentTooLong')
                        }
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-1 focus:ring-sky-500 focus:border-sky-500 text-sm sm:text-base"
                      placeholder={t('announcements.addModal.contentPlaceholder')}
                      rows={4}
                    />
                    {errors.contenu && (
                      <p className="mt-1 text-sm text-red-600">{errors.contenu.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('announcements.addModal.photoLabel')}
                    </label>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:space-x-4">
                      <label className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-50 text-gray-700 rounded-lg cursor-pointer border border-gray-200 w-full sm:w-auto justify-center sm:justify-start hover:bg-gray-100 transition-colors">
                        <Image weight="duotone" className="text-xl" />
                        <span className="text-sm">{t('announcements.addModal.addPhoto')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                      </label>
                      {imagePreview && (
                        <button
                          type="button"
                          onClick={() => setImagePreview(null)}
                          className="text-red-600 text-sm self-start sm:self-auto hover:text-red-700 transition-colors"
                        >
                          {t('announcements.addModal.removePhoto')}
                        </button>
                      )}
                    </div>
                    {imagePreview && (
                      <div className="mt-3">
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-96 h-64 rounded-lg object-cover"
                        />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 p-3 sm:p-4 border-t border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      reset();
                      setImagePreview(null);
                    }}
                    disabled={isSubmitting}
                    className="px-3 sm:px-4 py-2 text-gray-700 bg-gray-100 rounded-lg text-sm hover:bg-gray-200 transition-colors disabled:opacity-50"
                  >
                    {t('announcements.addModal.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-3 sm:px-4 py-2 bg-sky-600 text-white rounded-lg text-sm hover:bg-sky-700 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? t('common.saving') : t('announcements.addModal.publish')}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
