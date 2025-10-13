//TODO: Make multiple blocks of this for each error code
export const ErrorResponseSchema = {
  $id: 'ErrorResponse',
  type: 'object',
  properties: {
    statusCode: {
      type: 'number',
      description: 'The HTTP status code.',
      example: 404,
    },
    error: {
      type: 'string',
      description: 'The HTTP error phrase.',
      example: 'Not Found',
    },
    message: {
      type: 'string',
      description: 'A user-friendly error message.',
      example: 'Entity not found',
    },
  },
  required: ['statusCode', 'error', 'message'],
};
