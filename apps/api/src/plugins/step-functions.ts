import fp from 'fastify-plugin'
import type { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    stepFunctions?: import('@aws-sdk/client-sfn').SFNClient
    stepFunctionsCommands?: {
      StartExecutionCommand: typeof import('@aws-sdk/client-sfn').StartExecutionCommand
      StopExecutionCommand: typeof import('@aws-sdk/client-sfn').StopExecutionCommand
      DescribeStateMachineCommand: typeof import('@aws-sdk/client-sfn').DescribeStateMachineCommand
    }
  }
}

export default fp(async (fastify: FastifyInstance) => {
  let sfnModule: typeof import('@aws-sdk/client-sfn') | null = null

  try {
    sfnModule = (await import('@aws-sdk/client-sfn')) as typeof import('@aws-sdk/client-sfn')
  } catch (error) {
    fastify.log.warn(
      {
        error:
          error instanceof Error
            ? { message: error.message, name: error.name }
            : error,
      },
      'Step Functions client not available - skipping initialization. Install @aws-sdk/client-sfn to enable match settlement workflows.'
    )
    return
  }

  const { SFNClient, StartExecutionCommand, StopExecutionCommand, DescribeStateMachineCommand } =
    sfnModule

  const client = new SFNClient({
    region: fastify.config.AWS_REGION,
    ...(fastify.config.STEP_FUNCTIONS_ENDPOINT
      ? { endpoint: fastify.config.STEP_FUNCTIONS_ENDPOINT }
      : {}),
  })

  fastify.decorate('stepFunctions', client)
  fastify.decorate('stepFunctionsCommands', {
    StartExecutionCommand,
    StopExecutionCommand,
    DescribeStateMachineCommand,
  })

  fastify.addHook('onClose', async () => {
    client.destroy()
  })
})
