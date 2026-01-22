import { Partidas } from '../models/game.js';
import { actualizarEstadisticas } from './user.js';

export const iniciarEstadoJuego = () => {
  return {
    tableros: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      ganador: null,
      celdas: Array.from({ length: 9 }, (_, j) => ({ id: j, valor: null }))
    })),
    turnoActual: 'X',
    tableroActivo: null,
    ganador: null,
    jugadores: { X: null, O: null },
    usernames: { X: null, O: null },
    cantidadTurnos: 0
  };
};

export const patronesGanadores = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export const verificarGanador = (elementos, propiedad) => {
  for (const [a, b, c] of patronesGanadores) {
    if (elementos[a][propiedad] &&
      elementos[a][propiedad] === elementos[b][propiedad] &&
      elementos[a][propiedad] === elementos[c][propiedad]) {
      return elementos[a][propiedad];
    }
  }
  return null;
};

export const guardarPartida = async (roomId, juego) => {
  try {
    const nuevaPartida = new Partidas({
      sala: roomId,
      jugadorX: juego.usernames.X,
      jugadorO: juego.usernames.O,
      ganador: juego.ganador,
      cantidadTurnos: juego.cantidadTurnos
    });
    await nuevaPartida.save();

    if (juego.ganador === 'E') {
      await actualizarEstadisticas(juego.usernames.X, 'E');
      await actualizarEstadisticas(juego.usernames.O, 'E');
    } else {
      const ganador = juego.ganador === 'X' ? juego.usernames.X : juego.usernames.O;
      const perdedor = juego.ganador === 'X' ? juego.usernames.O : juego.usernames.X;
      await actualizarEstadisticas(ganador, 'G');
      await actualizarEstadisticas(perdedor, 'P');
    }
  } catch (error) {
    console.error('Error al guardar la partida:', error);
  }
};
