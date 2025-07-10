import Fastify from 'fastify';

const fastify = Fastify({
  logger: true,
});

fastify.get('/', function (request, reply) {
  reply.send({ hello: 'world' });
});

fastify.get('/health', function (request, reply) {
  const uptimeInSeconds = process.uptime();
  reply.send({ status: 'ok', uptime: `${uptimeInSeconds.toFixed(2)} seconds` });
});

fastify.listen({ port: 3000, host: '0.0.0.0' }, function (err) {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
