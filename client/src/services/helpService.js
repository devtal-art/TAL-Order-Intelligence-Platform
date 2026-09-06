import { apiClient } from './apiClient.js';

// Help button (new, additive). Sends the logged-in user's message to the
// team via the server's Brevo integration — POST /api/v1/help.
export const helpService = {
  send: (message) => apiClient.post('/v1/help', { message }),
};
