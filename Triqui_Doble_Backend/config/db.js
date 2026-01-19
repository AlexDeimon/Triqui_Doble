import { connect } from 'mongoose';

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