import apiClient from './apiClient';

export const sendMessageToRasa = async (message, sender = 'user') => {
  try {
    const response = await apiClient.post('/chat', { sender, message }, { timeout: 120000 });
    return response.data;
  } catch (error) {
    const detail = error.response?.data?.detail;
    throw new Error(
      typeof detail === 'string'
        ? detail
        : 'Le serveur ne répond pas. Vérifiez que l’API est démarrée.'
    );
  }
};
