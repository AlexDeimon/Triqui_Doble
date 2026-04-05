import { Partidas } from '../models/game.js';
import { actualizarEstadisticas } from './user.js';
import { GameRole } from '../utils/constants.js';

export const patronesGanadores = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export const mapeoPatrones = {
  '1ra Fila': 0, '2da Fila': 1, '3ra Fila': 2,
  '1ra Columna': 3, '2da Columna': 4, '3ra Columna': 5,
  'Diagonal Principal': 6, 'Diagonal Secundaria': 7
};

export const verificarGanador = (elementos, propiedad, patronEspecifico = 'Cualquiera') => {
  if (patronEspecifico === 'Cualquiera' || !mapeoPatrones.hasOwnProperty(patronEspecifico)) {
    for (const [a, b, c] of patronesGanadores) {
      if (elementos[a][propiedad] &&
        elementos[a][propiedad] === elementos[b][propiedad] &&
        elementos[a][propiedad] === elementos[c][propiedad]) {
        return elementos[a][propiedad];
      }
    }
  } else {
    const index = mapeoPatrones[patronEspecifico];
    const [a, b, c] = patronesGanadores[index];
    const valores = [elementos[a][propiedad], elementos[b][propiedad], elementos[c][propiedad]];
    const countX = valores.filter(v => v === GameRole.X).length;
    const countO = valores.filter(v => v === GameRole.O).length;

    if (countX >= 2) return GameRole.X;
    if (countO >= 2) return GameRole.O;
  }
  return null;
};


export const iniciarEstadoJuego = (roomId, is2v2) => {
  return {
    sala: roomId,
    tableros: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      ganador: null,
      celdas: Array.from({ length: 9 }, (_, j) => ({ id: j, valor: null }))
    })),
    turnoActual: GameRole.X,
    tableroActivo: null,
    ganador: null,
    jugadores: is2v2 ? { X1: null, O1: null, X2: null, O2: null } : { X: null, O: null },
    usernames: is2v2 ? { X1: null, O1: null, X2: null, O2: null } : { X: null, O: null },
    estado: 'esperando',
    ordenTurnos: is2v2 ? [GameRole.X1, GameRole.O1, GameRole.X2, GameRole.O2] : [GameRole.X, GameRole.O],
    indiceTurnoActual: 0,
    cantidadTurnos: 0,
    puntajes: { X: 0, O: 0 }
  };
};

export const movimiento = (juego, socketId, tableroId, celdaId) => {
  if (juego.estado && juego.estado !== 'jugando') return null;

  const miRolLargo = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socketId);
  if (!miRolLargo) return null;
  
  const rolJugador = miRolLargo.charAt(0);
  if (juego.turnoActual !== rolJugador) return null;

  if (juego.ordenTurnos && juego.indiceTurnoActual !== undefined) {
    const expectedRolLargo = juego.ordenTurnos[juego.indiceTurnoActual];
    const expectedSocket = juego.jugadores[expectedRolLargo];
    if (expectedSocket && expectedSocket !== socketId) return null;
  }

  const currentIndex = juego.tableros.findIndex(t => t.id === tableroId);
  if (juego.tableroActivo !== null && juego.tableroActivo !== currentIndex) {
    return;
  }

  const tablero = juego.tableros.find(t => t.id === tableroId);

  const celda = tablero.celdas[celdaId];

  if (celda.valor !== null) return;

  celda.valor = rolJugador;
  juego.cantidadTurnos++;

  const ganadorOriginal = tablero.ganador;
  if (juego.configuracion?.robarTableros || !ganadorOriginal) {
    const marcoLinea = patronesGanadores
      .filter(patron => patron.includes(celdaId))
      .some(patron => patron.every(idx => tablero.celdas[idx].valor === rolJugador));

    if (marcoLinea && ganadorOriginal !== rolJugador) {
      if (ganadorOriginal && ganadorOriginal !== GameRole.EMPATE) {
        juego.puntajes[ganadorOriginal] -= 10;
      }
      tablero.ganador = rolJugador;
      juego.puntajes[rolJugador] += 10;
      console.log(`Tablero ${tableroId} ganado/robado por ${rolJugador}`);
    } else if (!ganadorOriginal && tablero.celdas.every(c => c.valor !== null)) {
      tablero.ganador = GameRole.EMPATE;
      console.log(`Tablero ${tableroId} terminado en empate`);
    }
  }

  let ganadorGeneral = null;

  if (juego.configuracion && juego.configuracion.objetivo === 'mayoria') {
    const victoriasX = juego.tableros.filter(t => t.ganador === GameRole.X).length;
    const victoriasO = juego.tableros.filter(t => t.ganador === GameRole.O).length;
    
    if (victoriasX >= 5) {
      ganadorGeneral = GameRole.X;
    } else if (victoriasO >= 5) {
      ganadorGeneral = GameRole.O;
    } else if (juego.tableros.every(t => t.ganador !== null)) {
      if (victoriasX > victoriasO) ganadorGeneral = GameRole.X;
      else if (victoriasO > victoriasX) ganadorGeneral = GameRole.O;
    }
  } else {
    const patron = juego.configuracion?.patronGanador || 'Cualquiera';
    ganadorGeneral = verificarGanador(juego.tableros, 'ganador', patron);
  }

  if (ganadorGeneral) {
    juego.ganador = ganadorGeneral;
    juego.puntajes[ganadorGeneral] += 50;
    console.log(`Juego ganado por ${ganadorGeneral}`);
    guardarPartida(juego.sala, juego, juego.puntajes.X, juego.puntajes.O);
  } else {
    const todosTablerosTerminados = juego.tableros.every(t => t.ganador !== null);
    if (todosTablerosTerminados) {
      juego.ganador = GameRole.EMPATE;
      console.log("Juego terminado en empate");
      guardarPartida(juego.sala, juego, juego.puntajes.X, juego.puntajes.O);
    }
  }

  if (juego.configuracion?.tablerosMoviles && juego.cantidadTurnos > 0 && juego.cantidadTurnos % 10 === 0 && !juego.ganador) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const indices = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }

      const propuestos = indices.map(idx => juego.tableros[idx]);

      const isWinner = verificarGanador(propuestos, 'ganador', juego.configuracion?.patronGanador || 'Cualquiera');
      if (!isWinner) {
        juego.tableros = propuestos;
        break;
      }
    }
  }

  if (juego.configuracion && juego.configuracion.modoSeleccion === 'Aleatorio') {
    const tablerosDisponibles = juego.tableros.filter(t => !t.celdas.every(c => c.valor !== null));
    if (tablerosDisponibles.length > 0) {
      const randomIndex = Math.floor(Math.random() * tablerosDisponibles.length);
      const selectedBoard = tablerosDisponibles[randomIndex];
      juego.tableroActivo = juego.tableros.indexOf(selectedBoard);
    } else {
      juego.tableroActivo = null;
    }
  } else {
    const nextTablero = juego.tableros[celdaId];
    const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

    if (isNextFull) {
      juego.tableroActivo = null;
    } else {
      juego.tableroActivo = celdaId;
    }
  }



  if (juego.ordenTurnos) {
    juego.indiceTurnoActual = (juego.indiceTurnoActual + 1) % juego.ordenTurnos.length;
    juego.turnoActual = juego.ordenTurnos[juego.indiceTurnoActual][0];
  } else {
    juego.turnoActual = juego.turnoActual === GameRole.X ? GameRole.O : GameRole.X;
  }

  return juego;
}



export const rendirse = (juego, socketId) => {
  const miRolLargo = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socketId);
  if (!miRolLargo) return juego;

  const rolJugador = miRolLargo.charAt(0);
  juego.ganador = rolJugador === GameRole.X ? GameRole.O : GameRole.X;
  juego.puntajes[juego.ganador] += 50;
  console.log(`Jugador ${miRolLargo} se rindio. Ganador ${juego.ganador}.`);
  guardarPartida(juego.sala, juego, juego.puntajes.X, juego.puntajes.O);
  return juego;
}

export const guardarPartida = async (roomId, juego, puntajeX, puntajeO) => {
  try {
    const is2v2 = juego.ordenTurnos && juego.ordenTurnos.length === 4;
    
    const getUsername = (rol) => juego.jugadores[rol] !== null ? juego.usernames[rol] : null;
    
    const jugadoresXCompleto = is2v2 ? [juego.usernames.X1, juego.usernames.X2].filter(Boolean).join(',') : juego.usernames.X;
    const jugadoresOCompleto = is2v2 ? [juego.usernames.O1, juego.usernames.O2].filter(Boolean).join(',') : juego.usernames.O;
    
    const ganadoresX = is2v2 ? [getUsername('X1'), getUsername('X2')].filter(Boolean).join(',') : juego.usernames.X;
    const ganadoresO = is2v2 ? [getUsername('O1'), getUsername('O2')].filter(Boolean).join(',') : juego.usernames.O;

    let textGanador = juego.ganador;
    if (juego.ganador === GameRole.X) textGanador = ganadoresX;
    else if (juego.ganador === GameRole.O) textGanador = ganadoresO;

    const nuevaPartida = new Partidas({
      sala: roomId,
      jugadorX: jugadoresXCompleto,
      jugadorO: jugadoresOCompleto,
      ganador: textGanador,
      cantidadTurnos: juego.cantidadTurnos
    });
    await nuevaPartida.save();

    const aplicarPuntos = async (rolLargo, puntaje, resultado) => {
       const u = juego.usernames[rolLargo];
       const s = juego.jugadores[rolLargo];
       if (u && s) await actualizarEstadisticas(u, resultado, puntaje);
    };

    const rolesX = is2v2 ? ['X1', 'X2'] : ['X'];
    const rolesO = is2v2 ? ['O1', 'O2'] : ['O'];

    if (juego.ganador === GameRole.EMPATE) {
      for (const r of rolesX) await aplicarPuntos(r, puntajeX, GameRole.EMPATE);
      for (const r of rolesO) await aplicarPuntos(r, puntajeO, GameRole.EMPATE);
    } else {
      for (const r of rolesX) await aplicarPuntos(r, puntajeX, juego.ganador === GameRole.X ? 'G' : 'P');
      for (const r of rolesO) await aplicarPuntos(r, puntajeO, juego.ganador === GameRole.O ? 'G' : 'P');
    }
  } catch (error) {
    console.error('Error al guardar la partida:', error);
  }
};
