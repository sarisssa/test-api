declare module 'fastify' {
  interface FastifySchema {
    tags?: readonly string[];
    description?: string;
    consumes?: readonly string[];
    security?: readonly { [securityLabel: string]: readonly string[] }[];
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
      phoneNumber: string;
      type: 'access_token' | 'refresh_token';
    };
    user: {
      userId: string;
      phoneNumber: string;
      type: 'access_token' | 'refresh_token';
    };
  }
}

declare module '@fastify/multipart' {
  interface FastifyMultipartFile {
    toBuffer(): Promise<Buffer>;
    mimetype: string;
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    jwtVerify(): Promise<{
      userId: string;
      phoneNumber: string;
      type: 'access_token' | 'refresh_token';
    }>;
    user: {
      userId: string;
      phoneNumber: string;
      type: 'access_token' | 'refresh_token';
    };
  }
}
