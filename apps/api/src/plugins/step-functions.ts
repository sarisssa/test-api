import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type {
  SFNClient,
  StartExecutionCommand,
  StopExecutionCommand,
} from '@aws-sdk/client-sfn';

declare module 'fastify' {
  interface FastifyInstance {
    stepFunctions?: SFNClient;
    stepFunctionsCommands?: {
      StartExecutionCommand: typeof StartExecutionCommand;
      StopExecutionCommand: typeof StopExecutionCommand;
    };
  }
}

export default fp(async (fastify: FastifyInstance) => {
  let mod:
    | {
        SFNClient: typeof SFNClient;
        StartExecutionCommand: typeof StartExecutionCommand;
        StopExecutionCommand: typeof StopExecutionCommand;
      }
    | null = null;

  try {
    mod = (await import('@aws-sdk/client-sfn')) as typeof mod;
  } catch (error) {
    fastify.log.warn(
      {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      },
      'Step Functions client not available - skipping initialization. Install @aws-sdk/client-sfn to enable match settlement workflows.'
    );
    return;
  }

  const client = new mod.SFNClient({
    region: fastify.config.AWS_REGION,
    ...(fastify.config.STEP_FUNCTIONS_ENDPOINT
      ? { endpoint: fastify.config.STEP_FUNCTIONS_ENDPOINT }
      : {}),
  });

  fastify.decorate('stepFunctions', client);
  fastify.decorate('stepFunctionsCommands', {
    StartExecutionCommand: mod.StartExecutionCommand,
    StopExecutionCommand: mod.StopExecutionCommand,
  });

  fastify.addHook('onClose', async () => {
    client.destroy();
  });
});
