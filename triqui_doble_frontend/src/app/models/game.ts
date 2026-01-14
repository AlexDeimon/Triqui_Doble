export type Jugador = 'X' | 'O';

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
  tableros: tableroPequeño[];
  turnoActual: Jugador;
  tableroActivo: number | null;
  ganador: Jugador;
}
