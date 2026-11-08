import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patronesGanadores, mapeoPatrones, verificarGanador, iniciarEstadoJuego, movimiento, rendirse } from '../controllers/game.js';
import { GameRole } from '../utils/constants.js';

if (typeof Map.groupBy !== 'function') {
  Map.groupBy = (items, callback) => {
    const map = new Map();
    let i = 0;
    for (const item of items) {
      const key = callback(item, i++);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return map;
  };
}

const { savePartidaMock, actualizarEstadisticasMock } = vi.hoisted(() => ({
  savePartidaMock: vi.fn().mockResolvedValue(undefined),
  actualizarEstadisticasMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('../models/game.js', () => ({
  Partidas: class MockPartidas {
    constructor(data) {
      Object.assign(this, data);
    }
    save = savePartidaMock;
  }
}));

vi.mock('../controllers/user.js', () => ({
  actualizarEstadisticas: actualizarEstadisticasMock
}));

const crearPartidaLista = ({ is2v2 = false, configuracion = {} } = {}) => {
  const juego = iniciarEstadoJuego('SALA_TEST', is2v2);
  juego.estado = 'jugando';
  juego.configuracion = {
    temporizador: false,
    tiempo: 15,
    objetivo: 'triqui_doble',
    modoSeleccion: 'regla_oro',
    patronGanador: 'Cualquiera',
    tablerosMoviles: false,
    robarTableros: false,
    dosVsDos: is2v2,
    ...configuracion
  };

  if (is2v2) {
    juego.jugadores = { X1: 'sock-x1', O1: 'sock-o1', X2: 'sock-x2', O2: 'sock-o2' };
    juego.usernames = { X1: 'userX1', O1: 'userO1', X2: 'userX2', O2: 'userO2' };
  } else {
    juego.jugadores = { X: 'sock-x', O: 'sock-o' };
    juego.usernames = { X: 'userX', O: 'userO' };
  }

  return juego;
};

const crearRngSecuencial = (valores) => {
  let idx = 0;
  return () => {
    const val = valores[idx % valores.length];
    idx++;
    return val;
  };
};

describe('Tests de caracterización del motor de juego', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  describe('iniciarEstadoJuego', () => {
    it('inicializa correctamente el estado 1v1 con 9 tableros de 9 celdas vacías', () => {
      const juego = iniciarEstadoJuego('SALA_1V1', false);

      expect(juego.sala).toBe('SALA_1V1');
      expect(juego.tableros).toHaveLength(9);
      juego.tableros.forEach((t, idx) => {
        expect(t.id).toBe(idx);
        expect(t.ganador).toBeNull();
        expect(t.celdas).toHaveLength(9);
        expect(t.celdas.every(c => c.valor === null)).toBe(true);
      });
      expect(juego.turnoActual).toBe(GameRole.X);
      expect(juego.tableroActivo).toBeNull();
      expect(juego.ordenTurnos).toEqual(['X', 'O']);
      expect(juego.puntajes).toEqual({ X: 0, O: 0 });
    });

    it('inicializa correctamente los asientos y el orden de turnos en modo 2v2', () => {
      const juego = iniciarEstadoJuego('SALA_2V2', true);

      expect(juego.jugadores).toEqual({ X1: null, O1: null, X2: null, O2: null });
      expect(juego.ordenTurnos).toEqual(['X1', 'O1', 'X2', 'O2']);
      expect(juego.jugadoresListos).toEqual({ X1: false, O1: false, X2: false, O2: false });
    });
  });

  describe('verificarGanador (8 patrones y patrones específicos)', () => {
    const casosPatrones = Object.entries(mapeoPatrones).flatMap(([nombre, idx]) => [
      { nombre, patron: patronesGanadores[idx], rol: GameRole.X },
      { nombre, patron: patronesGanadores[idx], rol: GameRole.O }
    ]);

    it.each(casosPatrones)(
      'detecta victoria de $rol en "$nombre" ($patron) en modo Cualquiera',
      ({ patron, rol }) => {
        const tableros = Array.from({ length: 9 }, () => ({ ganador: null }));
        patron.forEach(i => { tableros[i].ganador = rol; });

        expect(verificarGanador(tableros, 'ganador', 'Cualquiera')).toBe(rol);
      }
    );

    it.each(Object.entries(mapeoPatrones))(
      'exige exclusivamente el patrón "%s" cuando está configurado',
      (nombrePatron, idxObjetivo) => {
        const tableros = Array.from({ length: 9 }, () => ({ ganador: null }));
        const otroIdx = (idxObjetivo + 1) % patronesGanadores.length;

        patronesGanadores[otroIdx].forEach(i => { tableros[i].ganador = GameRole.X; });
        const completaTambienObjetivo = patronesGanadores[idxObjetivo].every(
          i => tableros[i].ganador === GameRole.X
        );
        if (!completaTambienObjetivo) {
          expect(verificarGanador(tableros, 'ganador', nombrePatron)).toBeNull();
        }

        tableros.forEach(t => { t.ganador = null; });
        patronesGanadores[idxObjetivo].forEach(i => { tableros[i].ganador = GameRole.O; });
        expect(verificarGanador(tableros, 'ganador', nombrePatron)).toBe(GameRole.O);
      }
    );

    it('ignora líneas de 3 tableros empatados "E" (GameRole.EMPATE) y devuelve null (B-01)', () => {
      patronesGanadores.forEach(([a, b, c]) => {
        const tableros = Array.from({ length: 9 }, () => ({ ganador: null }));
        tableros[a].ganador = GameRole.EMPATE;
        tableros[b].ganador = GameRole.EMPATE;
        tableros[c].ganador = GameRole.EMPATE;

        expect(verificarGanador(tableros, 'ganador', 'Cualquiera')).toBeNull();
      });
    });
  });

  describe('movimiento · Validaciones básicas y Regla de Oro', () => {
    it('rechaza jugadas si el juego no está en estado "jugando", socket ajeno o turno equivocado', () => {
      const juego = crearPartidaLista();
      juego.estado = 'esperando';
      expect(movimiento(juego, 'sock-x', 0, 0)).toBeNull();

      juego.estado = 'jugando';
      expect(movimiento(juego, 'sock-intruso', 0, 0)).toBeNull();
      expect(movimiento(juego, 'sock-o', 0, 0)).toBeNull();
    });

    it('aplica la Regla de Oro: jugar en celda k activa el subtablero k y alterna el turno', () => {
      const juego = crearPartidaLista();

      const res = movimiento(juego, 'sock-x', 0, 4);
      expect(res).toBe(juego);
      expect(juego.tableros[0].celdas[4].valor).toBe('X');
      expect(juego.tableroActivo).toBe(4);
      expect(juego.turnoActual).toBe('O');
      expect(juego.cantidadTurnos).toBe(1);
      expect(juego.movimientos).toEqual([
        { turno: 1, rolJugador: 'X', tableroId: 0, celdaId: 4, tableroActivoResultante: 4 }
      ]);

      expect(movimiento(juego, 'sock-o', 2, 1)).toBeUndefined();
      expect(juego.cantidadTurnos).toBe(1);

      juego.tableroActivo = 0;
      expect(movimiento(juego, 'sock-o', 0, 4)).toBeUndefined();
    });

    it('otorga tiro libre (tableroActivo = null) cuando el subtablero destino está lleno', () => {
      const juego = crearPartidaLista();
      juego.tableros[5].celdas.forEach((c, idx) => {
        c.valor = idx % 2 === 0 ? 'X' : 'O';
      });
      juego.tableros[5].ganador = 'E';

      movimiento(juego, 'sock-x', 0, 5);
      expect(juego.tableroActivo).toBeNull();
      expect(juego.movimientos.at(-1).tableroActivoResultante).toBeNull();
    });

    it('no registra historial ni persiste partidas cuando isSimulation es true', () => {
      const juego = crearPartidaLista();
      juego.isSimulation = true;
      juego.tableros[0].ganador = 'X';
      juego.tableros[1].ganador = 'X';
      juego.tableros[2].celdas[0].valor = 'X';
      juego.tableros[2].celdas[1].valor = 'X';

      movimiento(juego, 'sock-x', 2, 2);

      expect(juego.ganador).toBe('X');
      expect(juego.movimientos).toEqual([]);
      expect(savePartidaMock).not.toHaveBeenCalled();
    });
  });

  describe('movimiento · Subtableros, puntajes y Robo de Tableros (robarTableros)', () => {
    it('suma +10 puntos al ganar un subtablero y marca empate "E" si se llena sin línea', () => {
      const juego = crearPartidaLista();
      juego.tableros[0].celdas[0].valor = 'X';
      juego.tableros[0].celdas[1].valor = 'X';

      movimiento(juego, 'sock-x', 0, 2);

      expect(juego.tableros[0].ganador).toBe('X');
      expect(juego.puntajes.X).toBe(10);

      const patronEmpate = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null];
      patronEmpate.forEach((v, i) => { juego.tableros[2].celdas[i].valor = v; });

      movimiento(juego, 'sock-o', 2, 8);
      expect(juego.tableros[2].ganador).toBe('E');
      expect(juego.puntajes).toEqual({ X: 10, O: 0 });
    });

    it('NO cambia el dueño del subtablero cuando robarTableros es false', () => {
      const juego = crearPartidaLista({ configuracion: { robarTableros: false } });
      juego.tableros[0].ganador = 'X';
      juego.puntajes.X = 10;
      juego.turnoActual = 'O';
      juego.indiceTurnoActual = 1;
      juego.tableros[0].celdas[3].valor = 'O';
      juego.tableros[0].celdas[4].valor = 'O';

      movimiento(juego, 'sock-o', 0, 5);

      expect(juego.tableros[0].ganador).toBe('X');
      expect(juego.puntajes).toEqual({ X: 10, O: 0 });
    });

    it('transfiere el subtablero (-10 al anterior, +10 al nuevo) cuando robarTableros es true', () => {
      const juego = crearPartidaLista({ configuracion: { robarTableros: true } });
      juego.tableros[0].ganador = 'X';
      juego.puntajes.X = 10;
      juego.turnoActual = 'O';
      juego.indiceTurnoActual = 1;
      juego.tableros[0].celdas[3].valor = 'O';
      juego.tableros[0].celdas[4].valor = 'O';

      movimiento(juego, 'sock-o', 0, 5);

      expect(juego.tableros[0].ganador).toBe('O');
      expect(juego.puntajes).toEqual({ X: 0, O: 10 });
    });
  });

  describe('movimiento · Condiciones de victoria global (triqui_doble y mayoria)', () => {
    it('declara ganador global en triqui_doble al alinear 3 subtableros, suma +50 y guarda partida', async () => {
      const juego = crearPartidaLista();
      juego.tableros[0].ganador = 'X';
      juego.tableros[4].ganador = 'X';
      juego.puntajes.X = 20;
      juego.tableros[8].celdas[0].valor = 'X';
      juego.tableros[8].celdas[1].valor = 'X';

      movimiento(juego, 'sock-x', 8, 2);
      await Promise.resolve();

      expect(juego.ganador).toBe('X');
      expect(juego.puntajes.X).toBe(80);
      expect(savePartidaMock).toHaveBeenCalledTimes(1);
    });

    it('declara ganador en modo "mayoria" al alcanzar 5 subtableros sin necesidad de formar línea', () => {
      const juego = crearPartidaLista({ configuracion: { objetivo: 'mayoria' } });
      [0, 1, 3, 5].forEach(i => { juego.tableros[i].ganador = 'X'; });
      juego.puntajes.X = 40;

      juego.tableros[7].celdas[6].valor = 'X';
      juego.tableros[7].celdas[7].valor = 'X';

      movimiento(juego, 'sock-x', 7, 8);

      expect(juego.ganador).toBe('X');
      expect(juego.puntajes.X).toBe(100);
    });

    it('desempata por mayoría simple cuando los 9 subtableros terminan sin llegar a 5', () => {
      const juego = crearPartidaLista({ configuracion: { objetivo: 'mayoria' } });
      [0, 1, 3].forEach(i => { juego.tableros[i].ganador = 'X'; });
      [2, 4, 6].forEach(i => { juego.tableros[i].ganador = 'O'; });
      [5, 7].forEach(i => { juego.tableros[i].ganador = 'E'; });
      juego.tableros[8].celdas[0].valor = 'X';
      juego.tableros[8].celdas[1].valor = 'X';

      movimiento(juego, 'sock-x', 8, 2);

      expect(juego.ganador).toBe('X');
    });

    it('NO termina la partida ni corrompe puntajes con NaN cuando 3 subtableros empatados "E" quedan alineados (B-01)', () => {
      const juego = crearPartidaLista();
      juego.tableros[0].ganador = GameRole.EMPATE;
      juego.tableros[1].ganador = GameRole.EMPATE;

      const patronCasiLleno = ['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', null];
      patronCasiLleno.forEach((v, i) => { juego.tableros[2].celdas[i].valor = v; });

      juego.turnoActual = 'O';
      juego.indiceTurnoActual = 1;
      movimiento(juego, 'sock-o', 2, 8);

      expect(juego.tableros[2].ganador).toBe(GameRole.EMPATE);
      expect(juego.ganador).toBeNull();
      expect(juego.puntajes).toEqual({ X: 0, O: 0 });
      expect(juego.puntajes['E']).toBeUndefined();
    });
  });

  describe('movimiento · Rotación 2v2 y desconexión de compañero', () => {
    it('exige el orden X1 -> O1 -> X2 -> O2 cuando todos están conectados, pero permite suplir a un compañero desconectado', () => {
      const juego = crearPartidaLista({ is2v2: true });

      expect(movimiento(juego, 'sock-x2', 0, 0)).toBeNull();

      expect(movimiento(juego, 'sock-x1', 0, 1)).toBeTruthy();
      expect(juego.ordenTurnos[juego.indiceTurnoActual]).toBe('O1');

      expect(movimiento(juego, 'sock-o2', 1, 2)).toBeNull();
      expect(movimiento(juego, 'sock-o1', 1, 2)).toBeTruthy();
      expect(juego.ordenTurnos[juego.indiceTurnoActual]).toBe('X2');

      expect(movimiento(juego, 'sock-x2', 2, 3)).toBeTruthy();
      expect(juego.ordenTurnos[juego.indiceTurnoActual]).toBe('O2');

      juego.jugadores.O2 = null;
      expect(movimiento(juego, 'sock-o1', 3, 4)).toBeTruthy();
      expect(juego.ordenTurnos[juego.indiceTurnoActual]).toBe('X1');
    });
  });

  describe('movimiento · Modos con RNG inyectado (Aleatorio y tablerosMoviles)', () => {
    it('selecciona el siguiente tableroActivo de forma determinista usando el RNG en modo "Aleatorio"', () => {
      const juego = crearPartidaLista({ configuracion: { modoSeleccion: 'Aleatorio' } });
      movimiento(juego, 'sock-x', 0, 0, () => 0.8);
      expect(juego.tableroActivo).toBe(7);
    });

    it('baraja los tableros en el turno 10 con RNG inyectado y descarta mezclas que regalen victoria inmediata', () => {
      const juego = crearPartidaLista({ configuracion: { tablerosMoviles: true } });
      juego.tableros[0].ganador = 'X';
      juego.tableros[1].ganador = 'X';
      juego.tableros[3].ganador = 'X';
      juego.cantidadTurnos = 9;
      const primerIntentoGanador = [
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.55,
        0.99,
        0.99
      ];
      const segundoIntentoValido = [
        0.0,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99,
        0.99
      ];
      const rng = crearRngSecuencial([...primerIntentoGanador, ...segundoIntentoValido]);

      movimiento(juego, 'sock-x', 4, 4, rng);

      expect(juego.cantidadTurnos).toBe(10);
      expect(juego.ganador).toBeNull();
      expect(juego.tableros.map(t => t.id)).toEqual([8, 1, 2, 3, 4, 5, 6, 7, 0]);
      expect(juego.movimientos.at(-1).ordenTableros).toEqual([8, 1, 2, 3, 4, 5, 6, 7, 0]);
    });
  });

  describe('rendirse e idempotencia de guardado (S-04)', () => {
    it('otorga victoria al oponente (+50) una única vez e ignora llamadas repetidas o de espectadores', async () => {
      const juego = crearPartidaLista();

      expect(rendirse(juego, 'sock-espectador')).toBeNull();

      const res = rendirse(juego, 'sock-x');
      await Promise.resolve();

      expect(res).toBe(juego);
      expect(juego.ganador).toBe('O');
      expect(juego.puntajes.O).toBe(50);
      expect(savePartidaMock).toHaveBeenCalledTimes(1);

      expect(rendirse(juego, 'sock-x')).toBeNull();
      expect(rendirse(juego, 'sock-o')).toBeNull();
      expect(juego.puntajes.O).toBe(50);
      expect(savePartidaMock).toHaveBeenCalledTimes(1);
    });
  });
});