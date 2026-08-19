import { Schema, model } from 'mongoose';

const movimientoSchema = new Schema({
  turno: { type: Number, required: true },
  rolJugador: { type: String, required: true },
  tableroId: { type: Number, required: true },
  celdaId: { type: Number, required: true },
  ordenTableros: { type: [Number], default: null },
  tableroActivoResultante: { type: Number, default: null }
}, { _id: false });

const gameSchema = new Schema({
    sala: { type: String, required: true },
    jugadorX: { type: String, required: true },
    jugadorO: { type: String, required: true },
    ganador: { type: String, required: true },
    cantidadTurnos: { type: Number, default: 0 },
    fecha: { type: Date, default: Date.now },
    movimientos: { type: [movimientoSchema], default: [] },
    skins: { type: Schema.Types.Mixed, default: null },
    configuracion: { type: Schema.Types.Mixed, default: null },
    usernames: { type: Schema.Types.Mixed, default: null }
}, { collection: 'partidas' });

export const Partidas = model('partidas', gameSchema);