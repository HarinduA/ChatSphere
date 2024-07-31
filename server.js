import { ApolloServer } from '@apollo/server';
import { expressMiddleware as apolloMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cors from 'cors';
import express from 'express';
import { readFile } from 'node:fs/promises';
import { useServer as useWsServer } from 'graphql-ws/lib/use/ws';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { authMiddleware, decodeToken, handleLogin } from './auth.js';
import { resolvers } from './resolvers.js';

const PORT = 9000;

const app = express();
app.use(cors());
app.use(express.json());

app.post('/login', handleLogin);

function getHttpContext({ req }) {
  if (req.auth) {
    return { user: req.auth.sub };
  }
  return {};
}

function getWsContext({ connectionParams }) {
  const accessToken = connectionParams?.accessToken;
  if (accessToken) {
    const payload = decodeToken(accessToken);
    return { user: payload.sub };
  }
  return {};
}

let typeDefs;
try {
  typeDefs = await readFile('./schema.graphql', 'utf8');
} catch (error) {
  console.error('Error reading schema file:', error);
  process.exit(1);
}

const schema = makeExecutableSchema({ typeDefs, resolvers });

const apolloServer = new ApolloServer({ schema });
try {
  await apolloServer.start();
} catch (error) {
  console.error('Error starting Apollo Server:', error);
  process.exit(1);
}

app.use('/graphql', authMiddleware, apolloMiddleware(apolloServer, {
  context: getHttpContext,
}));

const httpServer = createHttpServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });

try {
  useWsServer({ schema, context: getWsContext }, wsServer);
} catch (error) {
  console.error('Error setting up WebSocket server:', error);
  process.exit(1);
}

httpServer.listen({ port: PORT }, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
});

httpServer.on('error', (error) => {
  console.error('Server error:', error);
  process.exit(1);
});
