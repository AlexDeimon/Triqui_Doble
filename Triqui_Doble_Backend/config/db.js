import { connect } from 'mongoose';
import { createClient } from 'redis';

export const connectDB = async () => {
    try {
        const mongoUrl = process.env.MONGO_URI;
        const dbName = process.env.MONGO_DB_NAME;
        
        const conn = await connect(mongoUrl, { dbName });
        console.log('Conectado a MongoDB', conn.connection.host);
    } catch (error) {
        console.log('Error al conectar a MongoDB:', error);
        process.exit(1);
    }
};

export const redisClient = createClient({
    password: process.env.REDIS_PASSWORD,
    socket: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT
    }
});