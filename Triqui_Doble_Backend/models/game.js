import mongoose, { Schema, model } from 'mongoose';

const gameSchema = new Schema({
    ganador: { type: String, required: true },
    cantidadTurnos: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now }
}, { collection: 'partidas' });

export const Partidas = model('partidas', gameSchema);