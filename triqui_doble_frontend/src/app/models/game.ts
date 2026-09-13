export enum GameRole {
  X = 'X',
  O = 'O',
  X1 = 'X1',
  O1 = 'O1',
  X2 = 'X2',
  O2 = 'O2',
  Empate = 'E',
  Espectador = 'Espectador'
}

export type Jugador = GameRole.X | GameRole.O | GameRole.Empate | null;

export interface celda {
  id: number;
  valor: Jugador;
}

export interface tableroPequeño {
  id: number;
  celdas: celda[];
  ganador: Jugador;
  habilitado: boolean;
}

export interface estadoJuego {
  sala: string;
  tableros: tableroPequeño[];
  turnoActual: Jugador;
  tableroActivo: number | null;
  ganador: Jugador;
  jugadores: { [key: string]: string | null };
  usernames: { [key: string]: string | null };
  estado?: string;
  ordenTurnos?: string[];
  indiceTurnoActual?: number;
  espectadores?: { username: string; socketId: string }[];
  configuracion?: { temporizador: boolean; tiempo: number; objetivo?: string; modoSeleccion?: string; patronGanador?: string; tablerosMoviles?: boolean; robarTableros?: boolean; dosVsDos?: boolean; salaPrivada?: boolean; solitario?: boolean; dificultadBot?: string; };
  ultimaActualizacionTurno?: number;
  skins?: { [key: string]: { emoji: string; color: string; [key: string]: string } };
  jugadoresListos?: { [key: string]: boolean };
  salaPrivada?: boolean;
}

export const PATRONES_GANADORES: readonly [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

export const MAPEO_PATRONES: { readonly [key: string]: number } = {
  'Fila Superior': 0, 'Fila Central': 1, 'Fila Inferior': 2,
  'Columna Izquierda': 3, 'Columna Central': 4, 'Columna Derecha': 5,
  'Diagonal 1-9': 6, 'Diagonal 3-7': 7
};

export function calcularIndicesTablerosGanadores(tableros: { ganador: string | null }[], rolGanador: string, configuracion?: { objetivo?: string; patronGanador?: string }): Set<number> {
  const winningIndices = new Set<number>();

  if (!rolGanador || rolGanador === 'E') return winningIndices;

  if (configuracion?.objetivo === 'mayoria') {
    tableros.forEach((t, index) => {
      if (t.ganador === rolGanador) winningIndices.add(index);
    });
    return winningIndices;
  }

  const patronEspecifico = configuracion?.patronGanador;

  if (patronEspecifico && patronEspecifico !== 'Cualquiera' && MAPEO_PATRONES[patronEspecifico] !== undefined) {
    const pIdx = MAPEO_PATRONES[patronEspecifico];
    const [a, b, c] = PATRONES_GANADORES[pIdx];

    if (tableros[a]?.ganador === rolGanador && tableros[b]?.ganador === rolGanador && tableros[c]?.ganador === rolGanador) {
      winningIndices.add(a);
      winningIndices.add(b);
      winningIndices.add(c);
    }
  } else {
    for (const [a, b, c] of PATRONES_GANADORES) {
      if (tableros[a]?.ganador === rolGanador && tableros[b]?.ganador === rolGanador && tableros[c]?.ganador === rolGanador) {
        winningIndices.add(a);
        winningIndices.add(b);
        winningIndices.add(c);
      }
    }
  }

  if (winningIndices.size === 0) {
    tableros.forEach((t, index) => {
      if (t.ganador === rolGanador) winningIndices.add(index);
    });
  }

  return winningIndices;
}

export function obtenerSkinEmoji(rol: string | null, skins?: { [key: string]: { emoji?: string } } | null): string {
  if (!rol || rol === 'E') return '';
  const equipo = rol.charAt(0);
  return skins?.[equipo]?.emoji || equipo;
}

export function obtenerSkinColor(rol: string | null, skins?: { [key: string]: { color?: string } } | null, fallbackDefaults = false): string {
  if (!rol || rol === 'E') return '';
  const equipo = rol.charAt(0);
  if (skins?.[equipo]?.color) return skins[equipo].color!;
  if (fallbackDefaults) return equipo === 'X' ? '#e94560' : '#4597e9';
  return '';
}

export function obtenerFondoGanador(ganador: string | null, color: string, alphaHex: string = '99'): string {
  if (!ganador) return '';
  if (ganador === 'E') return 'rgba(100, 100, 100, 0.3)';
  if (!color) return '';
  return color + alphaHex;
}

export function esTableroDisponible(tablero?: { celdas: { valor: any }[] } | null): boolean {
  if (!tablero) return false;
  return !tablero.celdas.every(c => c.valor !== null);
}

export function calcularTableroBorderColor(isActivoOGanador: boolean, color: string): string {
  return isActivoOGanador && color ? color : '';
}

export function calcularTableroBoxShadow(isActivoOGanador: boolean, color: string, blur: number = 15): string {
  return isActivoOGanador && color ? `0 0 ${blur}px ${color}` : '';
}
