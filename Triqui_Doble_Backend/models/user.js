import mongoose, { Schema, model } from 'mongoose';

const userSchema = new Schema({
    username: {type: String, required: true, unique: true, trim: true},
    password: {type: String, required: true},
    estadisticas: {
        partidasGanadas: {type: Number, default: 0},
        partidasPerdidas: {type: Number, default: 0},
        partidasEmpatadas: {type: Number, default: 0},
        puntaje: {type: Number, default: 0}
    }
});

export const Usuario = model('usuario', userSchema);
