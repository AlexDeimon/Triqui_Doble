import { Partidas } from '../models/game.js';
import { actualizarEstadisticas } from './user.js';

export const iniciarEstadoJuego = (roomId) => {
  return {
    sala: roomId,
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

export const movimiento = (juego, socketId, tableroId, celdaId) => {
  const jugadorX = juego.jugadores.X === socketId;
  const rolJugador = jugadorX ? 'X' : 'O';

  if (juego.turnoActual !== rolJugador) return;

  if (juego.tableroActivo !== null && juego.tableroActivo !== tableroId) {
    return;
  }

  const tablero = juego.tableros[tableroId];

  const celda = tablero.celdas[celdaId];

  if (celda.valor !== null) return;

  celda.valor = rolJugador;
  juego.cantidadTurnos++;

  if (!tablero.ganador) {
    const ganadorTablero = verificarGanador(tablero.celdas, 'valor');
    if (ganadorTablero) {
      tablero.ganador = ganadorTablero;
      console.log(`Tablero ${tableroId} ganado por ${ganadorTablero}`);
    } else if (tablero.celdas.every(c => c.valor !== null)) {
      tablero.ganador = 'E';
      console.log(`Tablero ${tableroId} terminado en empate`);
    }
  }

  const ganadorGeneral = verificarGanador(juego.tableros, 'ganador');
  if (ganadorGeneral) {
    juego.ganador = ganadorGeneral;
    console.log(`Juego ganado por ${ganadorGeneral}`);
    guardarPartida(juego.sala, juego);
  } else {
    const todosTablerosTerminados = juego.tableros.every(t => t.ganador !== null);
    if (todosTablerosTerminados) {
      juego.ganador = 'E';
      console.log("Juego terminado en empate");
      guardarPartida(juego.sala, juego);
    }
  }

  const nextTablero = juego.tableros[celdaId];
  const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

  if (isNextFull) {
    juego.tableroActivo = null;
  } else {
    juego.tableroActivo = celdaId;
  }

  juego.turnoActual = juego.turnoActual === 'X' ? 'O' : 'X';

  return juego;
}

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

export const rendirse = (juego, socketId) => {
  const jugadorX = juego.jugadores.X === socketId;
  const rolJugador = jugadorX ? 'X' : 'O';
  juego.ganador = rolJugador === 'X' ? 'O' : 'X';
  console.log(`Jugador ${rolJugador} se rindio`);
  guardarPartida(juego.sala, juego);
  return juego;
}

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
