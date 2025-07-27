import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { sqs } from './aws-clients.js'

export const scheduleNextExecution = async (delaySeconds: number = 10): Promise<void> => {
  const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL

  if (!SQS_QUEUE_URL) {
    console.error('SQS_QUEUE_URL environment variable is not set. Cannot schedule next execution.')
    return
  }

  const sendMessageParams = {
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify({
      source: 'self-invocation',
      timestamp: Date.now()
    }),
    DelaySeconds: delaySeconds
  }

  await sqs.send(new SendMessageCommand(sendMessageParams))
  console.log(`Successfully scheduled next execution in ${delaySeconds} seconds.`)
}
