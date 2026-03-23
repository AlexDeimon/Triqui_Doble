import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
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
app.use(cors());
app.use(express.json());

app.use('/', userRouter);
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000
});

initializeSockets(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});