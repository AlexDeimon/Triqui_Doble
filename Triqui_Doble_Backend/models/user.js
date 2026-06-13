import mongoose, { Schema, model } from 'mongoose';

const userSchema = new Schema({
    username: {type: String, required: true, unique: true, trim: true},
    password: {type: String, required: true},
    estadisticas: {
        partidasGanadas: {type: Number, default: 0},
        partidasPerdidas: {type: Number, default: 0},
        partidasEmpatadas: {type: Number, default: 0},
        puntaje: {type: Number, default: 0}
    },
    amigos: [{
        usuario: { type: Schema.Types.ObjectId, ref: 'usuario' },
        username: String,
        estado: { type: String, enum: ['solicitado', 'pendiente', 'aceptado'], default: 'pendiente' }
    }],
    profileImage: { type: String, default: '👤' }
});

export const Usuario = model('usuario', userSchema);
