export type Jugador = 'X' | 'O' | 'E' | null;

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
  usernames: { X: string | null; O: string | null };
  espectadores?: { username: string; socketId: string }[];
  configuracion?: { temporizador: boolean; tiempo: number; objetivo?: string };
  ultimaActualizacionTurno?: number;
}
