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
  configuracion?: { temporizador: boolean; tiempo: number; objetivo?: string; modoSeleccion?: string; patronGanador?: string; tablerosMoviles?: boolean; robarTableros?: boolean; dosVsDos?: boolean };
  ultimaActualizacionTurno?: number;
  skins?: { [key: string]: { emoji: string; color: string; [key: string]: string } };
  jugadoresListos?: { [key: string]: boolean };
  salaPrivada?: boolean;
}
