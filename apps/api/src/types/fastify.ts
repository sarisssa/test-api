declare module 'fastify' {
  interface FastifySchema {
    tags?: string[];
    description?: string;
    consumes?: string[];
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      userId: string;
    };
    user: {
      userId: string;
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
    }>;
    user: {
      userId: string;
    };
  }
}
