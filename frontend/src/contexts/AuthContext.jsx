import { createContext, useState } from 'react';
import apiClient from '../services/apiClient';

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext();

function readStoredUser() {
  try {
    const saved = localStorage.getItem('crm_user');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    localStorage.removeItem('crm_user');
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);

  const login = async (username, password) => {
    try {
      const res = await apiClient.post('/login', { username, password });
      const userData = { token: res.data.token, name: res.data.delegateName, username };
      setUser(userData);
      localStorage.setItem('crm_user', JSON.stringify(userData));
      return { success: true };
    } catch (error) {
      const detail = error?.response?.data?.detail;
      return { success: false, error: typeof detail === 'string' ? detail : 'Connexion impossible. Vérifiez que l’API est démarrée.' };
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('crm_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
