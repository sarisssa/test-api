declare module 'fastify' {
  interface FastifySchema {
    tags?: string[];
    description?: string;
    consumes?: string[];
    security?: Array<{ [key: string]: string[] }>;
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
  interface FastifyInstance {
    jwt: {
      sign(payload: object, options?: { expiresIn?: string }): string;
      verify<T = unknown>(token: string): T;
    };
  }
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
