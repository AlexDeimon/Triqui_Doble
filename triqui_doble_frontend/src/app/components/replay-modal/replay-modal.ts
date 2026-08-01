import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebsocketService } from '../../services/websocket';

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

  readonly patronesGanadores = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];

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
          const marcoLinea = this.patronesGanadores
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
    if (!rol || rol === 'E') return '';
    const equipo = rol.charAt(0);
    return this.partida?.skins?.[equipo]?.emoji || equipo;
  }

  getSkinColor(rol: string | null): string {
    if (!rol || rol === 'E') return '';
    const equipo = rol.charAt(0);
    return this.partida?.skins?.[equipo]?.color || (equipo === 'X' ? '#e94560' : '#4597e9');
  }

  getCellBackground(ganador: string | null): string {
    if (!ganador) return '';
    if (ganador === 'E') return 'rgba(100,100,100,0.3)';
    const color = this.getSkinColor(ganador);
    return color + '55';
  }

  tableroActivoEnEstado(tableroIndex: number): boolean {
    if (this.stepIndex === this.totalMoves) return false;
    const state = this.currentState;
    if (!state) return false;
    if (state.tableroActivo === null) {
      return !state.tableros[tableroIndex].celdas.every(c => c.valor !== null);
    }
    return state.tableroActivo === tableroIndex;
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
