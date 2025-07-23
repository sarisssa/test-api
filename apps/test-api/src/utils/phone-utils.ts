import crypto from 'crypto';

let phoneHashSalt: string | null = null;

export const formatPhoneNumber = (phoneNumber: string): string => {
  const normalized = phoneNumber.replace(/\s+/g, '');
  if (!normalized.startsWith('+')) {
    return '+1' + normalized.replace(/\D/g, '');
  }
  return normalized;
};

export const initializePhoneHashSalt = (salt: string): void => {
  phoneHashSalt = salt;
};

export const hashPhoneNumber = (phoneNumber: string): string => {
  if (!phoneHashSalt) {
    throw new Error(
      'Phone hash salt not initialized. Make sure environment variables are loaded.'
    );
  }

  const normalizedPhone = formatPhoneNumber(phoneNumber);

  return crypto
    .createHmac('sha256', phoneHashSalt)
    .update(normalizedPhone)
    .digest('hex');
};
