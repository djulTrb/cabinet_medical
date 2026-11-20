import { createSlice } from '@reduxjs/toolkit';

const getInitialLanguage = () => {
  try {
    const saved = localStorage.getItem('userState');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.language === 'ar' || parsed?.language === 'fr') {
        return parsed.language;
      }
    }
    const i18nLng = localStorage.getItem('i18nextLng');
    if (i18nLng?.startsWith('ar')) return 'ar';
  } catch {
    // ignore storage errors
  }
  return 'fr';
};

const defaultState = () => ({
  id: null,
  name: '',
  email: '',
  role: '',
  avatar: null,
  language: getInitialLanguage(),
  isAuthenticated: false,
  authInitialized: false,
});

const persistUserState = (state) => {
  try {
    const { authInitialized: _ignored, ...persisted } = state;
    localStorage.setItem('userState', JSON.stringify(persisted));
    if (state.isAuthenticated) {
      localStorage.setItem('isAuthenticated', 'true');
      if (state.role) localStorage.setItem('userRole', state.role);
    } else {
      localStorage.removeItem('isAuthenticated');
      localStorage.removeItem('userRole');
    }
  } catch {
    // ignore storage errors
  }
};

export const userSlice = createSlice({
  name: 'user',
  initialState: defaultState(),
  reducers: {
    updateProfile: (state, action) => {
      const { name, email, avatar } = action.payload;
      if (name !== undefined) state.name = name;
      if (email !== undefined) state.email = email;
      if (avatar !== undefined) state.avatar = avatar;
      persistUserState(state);
    },
    updateLanguage: (state, action) => {
      state.language = action.payload;
      persistUserState(state);
    },
    updateUser: (state, action) => {
      const { id, role, name, email, avatar, language, isAuthenticated } = action.payload;
      if (id !== undefined) state.id = id;
      if (role !== undefined) state.role = (role || '').toString().toLowerCase();
      if (name !== undefined) state.name = name;
      if (email !== undefined) state.email = email;
      if (avatar !== undefined) state.avatar = avatar;
      if (language !== undefined && language) state.language = language;
      if (typeof isAuthenticated === 'boolean') state.isAuthenticated = isAuthenticated;
      persistUserState(state);
    },
    setAuthInitialized: (state, action) => {
      state.authInitialized = action.payload;
    },
    clearUser: (state) => {
      state.id = null;
      state.name = '';
      state.email = '';
      state.role = '';
      state.avatar = null;
      state.isAuthenticated = false;
      try {
        localStorage.removeItem('userState');
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userRole');
        localStorage.removeItem('activeAppointment');
      } catch {
        // ignore storage errors
      }
    },
  },
});

export const {
  updateProfile,
  updateLanguage,
  updateUser,
  setAuthInitialized,
  clearUser,
} = userSlice.actions;

export default userSlice.reducer;
