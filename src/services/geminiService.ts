import axios from 'axios';

const API_URL = import.meta.env.VITE_API_ORIGIN;

export async function generateDailyMessage(period: string, variationKey: string) {
  const response = await axios.post(`${API_URL}/api/generate-message`, { period, variationKey });
  return response.data;
}

export async function generateDailyImage(period: string, variationKey: string) {
  const response = await axios.post(`${API_URL}/api/generate-image`, { period, variationKey });
  return response.data;
}

export const createVariationKey = () => Math.random().toString(36).substring(7);