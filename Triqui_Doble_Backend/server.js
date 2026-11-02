import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { redisClient } from './config/db.js';
import { connectDB } from './config/db.js';
import userRouter from './routes/user.js';
import { initializeSockets } from './sockets/socketManager.js';
import { errorHandler } from './middlewares/errorHandler.js';

connectDB();
redisClient.on('error', err => console.log('Redis Client Error', err));
await redisClient.connect().catch(err => console.error('Error inicial conectando a Redis', err));
console.log('Conectado a Redis');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL, methods: ['GET', 'POST'] }));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Demasiados intentos. Intente de nuevo más tarde.' }
});

app.use(express.json());
app.use(['/login', '/registrar'], authLimiter);
app.use('/', userRouter);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL },
  pingTimeout: 60000,
  pingInterval: 25000
});

initializeSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});