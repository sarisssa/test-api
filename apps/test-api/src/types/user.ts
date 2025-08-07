import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const updateUsernameBodySchema = z.object({
  userId: z.string(),
  username: z.string(),
});
export type UpdateUsernameBody = z.infer<typeof updateUsernameBodySchema>;

export const updateUsernameJsonSchema = zodToJsonSchema(
  updateUsernameBodySchema
);
