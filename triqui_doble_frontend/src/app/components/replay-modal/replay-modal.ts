import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../../services/websocket';
import { PATRONES_GANADORES, calcularIndicesTablerosGanadores, obtenerSkinEmoji, obtenerSkinColor, obtenerFondoGanador, esTableroDisponible, calcularTableroBorderColor, calcularTableroBoxShadow } from '../../models/game';

interface Celda { id: number; valor: string | null; }
interface Tablero { id: number; ganador: string | null; celdas: Celda[]; }
interface BoardState {
  tableros: Tablero[];
  tableroActivo: number | null;
  turnoActual: string;
  rolJugador: string;
  tableroId: number;
  celdaId: number;
}

@Component({
  standalone: true,
  selector: 'app-replay-modal',
  imports: [CommonModule],
  templateUrl: './replay-modal.html',
  styleUrl: './replay-modal.css'
})

export class ReplayModalComponent implements OnChanges {
  @Input() partidaId: string = '';
  @Input() showModal: boolean = false;
  @Output() close = new EventEmitter<void>();

  loading: boolean = false;
  error: string = '';
  partida: any = null;

  states: BoardState[] = [];
  stepIndex: number = 0;

  constructor(
    private websocketService: WebsocketService,
    private cd: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['showModal'] && this.showModal && this.partidaId) {
      this.cargarReplay();
    }
    if (changes['showModal'] && !this.showModal) {
      this.reset();
    }
  }

  reset() {
    this.states = [];
    this.stepIndex = 0;
    this.partida = null;
    this.error = '';
    this.loading = false;
  }

  cargarReplay() {
    this.loading = true;
    this.error = '';
    this.states = [];
    this.websocketService.obtenerReplay(this.partidaId).subscribe({
      next: (data) => {
        try {
          this.partida = data;
          this.buildStates(data);
          this.loading = false;
          this.cd.detectChanges();
        } catch (e: any) {
          console.error("Error al procesar el replay:", e);
          this.error = "Error al procesar los datos de la repetición: " + e.message;
          this.loading = false;
          this.cd.detectChanges();
        }
      },
      error: (err) => {
        this.error = err.error?.msg || 'Error cargando el replay';
        this.loading = false;
        this.cd.detectChanges();
      }
    });
  }

  buildStates(data: any) {
    let tableros: Tablero[] = Array.from({ length: 9 }, (_, i) => ({
      id: i,
      ganador: null,
      celdas: Array.from({ length: 9 }, (_, j) => ({ id: j, valor: null }))
    }));

    const ordenTurnos = this.is2v2
      ? ['X1', 'O1', 'X2', 'O2']
      : ['X', 'O'];

    this.states = [{
      tableros: this.deepCopy(tableros),
      tableroActivo: null,
      turnoActual: 'X',
      rolJugador: '',
      tableroId: -1,
      celdaId: -1
    }];

    for (const mov of data.movimientos) {
      if (mov.ordenTableros && mov.ordenTableros.length === 9) {
        const byId: { [id: number]: Tablero } = {};
        tableros.forEach(t => byId[t.id] = t);
        tableros = mov.ordenTableros.map((id: number) => byId[id]);
      }

      const tableroIndex = tableros.findIndex(t => t.id === mov.tableroId);
      if (tableroIndex !== -1) {
        const rol = mov.rolJugador.charAt(0);
        tableros[tableroIndex].celdas[mov.celdaId].valor = rol;

        const ganadorOriginal = tableros[tableroIndex].ganador;
        if (data.configuracion?.robarTableros || !ganadorOriginal) {
          const celdas = tableros[tableroIndex].celdas;
          const marcoLinea = PATRONES_GANADORES
            .filter(patron => patron.includes(mov.celdaId))
            .some(patron => patron.every(idx => celdas[idx].valor === rol));

          if (marcoLinea && ganadorOriginal !== rol) {
            tableros[tableroIndex].ganador = rol;
          } else if (!ganadorOriginal && celdas.every(c => c.valor !== null)) {
            tableros[tableroIndex].ganador = 'E';
          }
        }
      }

      const tableroActivo = mov.tableroActivoResultante !== undefined ? mov.tableroActivoResultante : null;

      const currentMoveIndex = data.movimientos.indexOf(mov);
      const nextTurnoIndex = (currentMoveIndex + 1) % ordenTurnos.length;
      const nextTurno = ordenTurnos[nextTurnoIndex % ordenTurnos.length].charAt(0);

      this.states.push({
        tableros: this.deepCopy(tableros),
        tableroActivo,
        turnoActual: nextTurno,
        rolJugador: mov.rolJugador,
        tableroId: mov.tableroId,
        celdaId: mov.celdaId
      });
    }

    this.stepIndex = 0;
  }

  deepCopy(tableros: Tablero[]): Tablero[] {
    return tableros.map(t => ({
      id: t.id,
      ganador: t.ganador,
      celdas: t.celdas.map(c => ({ id: c.id, valor: c.valor }))
    }));
  }

  get currentState(): BoardState | null {
    return this.states[this.stepIndex] || null;
  }

  get totalMoves(): number {
    return this.states.length - 1;
  }

  prev() {
    if (this.stepIndex > 0) this.stepIndex--;
  }

  next() {
    if (this.stepIndex < this.states.length - 1) this.stepIndex++;
  }

  goToStart() { this.stepIndex = 0; }
  goToEnd() { this.stepIndex = this.states.length - 1; }

  getSkinEmoji(rol: string | null): string {
    return obtenerSkinEmoji(rol, this.partida?.skins);
  }

  getSkinColor(rol: string | null): string {
    return obtenerSkinColor(rol, this.partida?.skins, true);
  }

  getCellBackground(ganador: string | null): string {
    return obtenerFondoGanador(ganador, this.getSkinColor(ganador), '55');
  }

  get winnerRole(): string | null {
    if (!this.partida || !this.partida.ganador) return null;
    const g = this.partida.ganador;
    if (g === 'E' || g === 'Empate') return 'E';
    if (g === 'X' || g === 'O') return g;

    const u = this.partida.usernames;
    if (u) {
      if (u.X === g || u.X1 === g || u.X2 === g) return 'X';
      if (u.O === g || u.O1 === g || u.O2 === g) return 'O';
    }

    if (this.partida.jugadorX && (this.partida.jugadorX === g || this.partida.jugadorX.split(',').includes(g))) return 'X';
    if (this.partida.jugadorO && (this.partida.jugadorO === g || this.partida.jugadorO.split(',').includes(g))) return 'O';

    const finalState = this.states[this.states.length - 1];
    if (finalState) {
      const tableros = finalState.tableros;
      const countX = tableros.filter(t => t.ganador === 'X').length;
      const countO = tableros.filter(t => t.ganador === 'O').length;
      if (this.partida.configuracion?.objetivo === 'mayoria') {
        if (countX >= 5 || countX > countO) return 'X';
        if (countO >= 5 || countO > countX) return 'O';
      }
      for (const [a, b, c] of PATRONES_GANADORES) {
        if (tableros[a]?.ganador && tableros[a].ganador === tableros[b]?.ganador && tableros[a].ganador === tableros[c]?.ganador) {
          if (tableros[a].ganador !== 'E') return tableros[a].ganador;
        }
      }
      if (countX > countO) return 'X';
      if (countO > countX) return 'O';
    }

    return null;
  }

  getTablerosGanadoresFinales(): Set<number> {
    const rolGanador = this.winnerRole;
    if (!rolGanador || rolGanador === 'E') return new Set();

    const finalState = this.states[this.states.length - 1];
    if (!finalState) return new Set();

    return calcularIndicesTablerosGanadores(finalState.tableros, rolGanador, this.partida?.configuracion);
  }

  esTableroGanadorEnReplay(tableroIndex: number): boolean {
    if (this.stepIndex !== this.totalMoves) return false;
    return this.getTablerosGanadoresFinales().has(tableroIndex);
  }

  tableroActivoEnEstado(tableroIndex: number): boolean {
    if (this.stepIndex === this.totalMoves) {
      return this.esTableroGanadorEnReplay(tableroIndex);
    }
    const state = this.currentState;
    if (!state) return false;
    if (state.tableroActivo === null) {
      return esTableroDisponible(state.tableros[tableroIndex]);
    }
    return state.tableroActivo === tableroIndex;
  }

  getTableroActiveColor(tableroIndex: number): string {
    if (this.stepIndex === this.totalMoves && this.winnerRole && this.winnerRole !== 'E') {
      return this.getSkinColor(this.winnerRole);
    }
    return this.currentState ? this.getSkinColor(this.currentState.turnoActual) : '';
  }

  getTableroBoxShadow(tableroIndex: number): string {
    if (this.stepIndex === this.totalMoves) {
      const isWinnerBoard = this.esTableroGanadorEnReplay(tableroIndex);
      return calcularTableroBoxShadow(isWinnerBoard, this.getSkinColor(this.winnerRole), 15);
    }
    const isActive = this.tableroActivoEnEstado(tableroIndex);
    const currentColor = this.currentState ? this.getSkinColor(this.currentState.turnoActual) : '';
    return calcularTableroBoxShadow(isActive, currentColor, 15);
  }

  getTableroBorderColor(tableroIndex: number): string {
    if (this.stepIndex === this.totalMoves) {
      const isWinnerBoard = this.esTableroGanadorEnReplay(tableroIndex);
      return calcularTableroBorderColor(isWinnerBoard, this.getSkinColor(this.winnerRole));
    }
    const isActive = this.tableroActivoEnEstado(tableroIndex);
    const currentColor = this.currentState ? this.getSkinColor(this.currentState.turnoActual) : '';
    return calcularTableroBorderColor(isActive, currentColor);
  }

  getUsername(rolLargo: string): string {
    return this.partida?.usernames?.[rolLargo] || rolLargo;
  }

  get is2v2(): boolean {
    return !!(this.partida?.usernames?.['X1'] || this.partida?.usernames?.['O1']);
  }

  get jugadoresInfo(): { rol: string; username: string; color: string; emoji: string }[] {
    if (!this.partida) return [];
    const roles = this.is2v2 ? ['X1','X2','O1','O2'] : ['X','O'];
    return roles.map(rol => ({
      rol,
      username: this.getUsername(rol),
      color: this.getSkinColor(rol),
      emoji: this.getSkinEmoji(rol)
    })).filter(j => j.username);
  }

  get lastMoveInfo(): string {
    if (this.stepIndex === 0) return 'Estado inicial';
    const state = this.currentState;
    if (!state) return '';
    return `Turno ${this.stepIndex}: ${this.getUsername(state.rolJugador)} ${this.getSkinEmoji(state.rolJugador)}`;
  }
}
