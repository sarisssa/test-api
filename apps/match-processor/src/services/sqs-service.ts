import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { sqs } from './aws-clients.js'

export const scheduleNextExecution = async (delaySeconds: number = 10): Promise<void> => {
  const queueUrl = process.env.SQS_QUEUE_URL

  if (!queueUrl) {
    throw new Error('SQS_QUEUE_URL environment variable is not set. Cannot schedule next execution.')
  }

  const normalizedDelay = Math.min(Math.max(Math.floor(delaySeconds), 0), 900)

  const sendMessageParams = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify({
      source: 'self-invocation',
      timestamp: Date.now()
    }),
    DelaySeconds: normalizedDelay
  }

  await sqs.send(new SendMessageCommand(sendMessageParams))
  console.log(`Successfully scheduled next execution in ${normalizedDelay} seconds.`)
}
