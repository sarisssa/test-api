import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const sendOtpBodySchema = z.object({
  phoneNumber: z
    .string()
    .min(10, 'Phone number must be at least 10 digits.')
    .regex(
      /^\+?\d{10,15}$/,
      'Invalid phone number format. Must be E.164 format or a 10-15 digit number.'
    ),
});
export type SendOtpBody = z.infer<typeof sendOtpBodySchema>;

export const verifyOtpBodySchema = z.object({
  code: z.string().length(6, 'OTP code must be exactly 6 digits.'),
  phoneNumber: z
    .string()
    .min(10, 'Phone number must be at least 10 digits.')
    .regex(
      /^\+?\d{10,15}$/,
      'Invalid phone number format. Must be E.164 format or a 10-15 digit number.'
    ),
});
export type VerifyOtpBody = z.infer<typeof verifyOtpBodySchema>;

export const sendOtpJsonSchema = zodToJsonSchema(sendOtpBodySchema);
export const verifyOtpJsonSchema = zodToJsonSchema(verifyOtpBodySchema);
