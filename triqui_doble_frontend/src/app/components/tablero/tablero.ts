import { Component, OnInit, OnDestroy, NgZone, signal, effect, untracked, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { estadoJuego, GameRole } from '../../models/game';
import { WebsocketService } from '../../services/websocket';
import { AudioService } from '../../services/audio';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-tablero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tablero.html',
  styleUrl: './tablero.css'
})

export class TableroComponent implements OnInit, OnDestroy {
  public GameRole = GameRole;

  animarPatron = signal<boolean>(false);

  gameState = signal<estadoJuego | null>(null);
  myRole = this.websocketService.myRole;
  tiempoRestante = signal<number>(0);
  animacionesGanador: { [id: number]: boolean } = {};
  private timerInterval: any;
  private yaAnimado: boolean = false;

  mapeoPatrones: any = {
    '1ra Fila': [0, 1, 2],
    '2da Fila': [3, 4, 5],
    '3ra Fila': [6, 7, 8],
    '1ra Columna': [0, 3, 6],
    '2da Columna': [1, 4, 7],
    '3ra Columna': [2, 5, 8],
    'Diagonal Principal': [0, 4, 8],
    'Diagonal Secundaria': [2, 4, 6]
  };

  constructor(
    public websocketService: WebsocketService,
    private ngZone: NgZone,
    private audioService: AudioService,
    private router: Router,
    private cd: ChangeDetectorRef
  ) {
    let lastState: estadoJuego | null = null;

    effect(() => {
      const state = this.websocketService.gameState();

      this.ngZone.run(() => {
        const previousState = lastState;

        const getOccupiedCount = (s: estadoJuego | null) =>
          s ? s.tableros.reduce((acc, t) => acc + t.celdas.filter(c => c.valor !== null).length, 0) : 0;

        const prevCount = getOccupiedCount(previousState);
        const newCount = getOccupiedCount(state);

        if (state && state.estado === 'jugando') {
          if (!this.yaAnimado || (state.tableros.every(t => t.celdas.every(c => c.valor === null)) && prevCount > 0)) {
            this.animarPatron.set(true);
            this.yaAnimado = true;
            setTimeout(() => this.animarPatron.set(false), 3000);
          }
        } else {
          this.yaAnimado = false;
        }

        if (state && prevCount < newCount) {
          this.audioService.playMoveSound();
        }

        if (state && previousState) {
          state.tableros.forEach((t, i) => {
            const prevT = previousState.tableros[i];
            if (t.ganador && t.ganador !== prevT.ganador) {
               this.animacionesGanador[t.id] = true;
               setTimeout(() => {
                 this.animacionesGanador[t.id] = false;
                 this.cd.detectChanges();
               }, 1000);
            }
          });
        }

        if (state?.configuracion?.temporizador && state.ultimaActualizacionTurno && !state.ganador) {
          this.iniciarTemporizadorLocal(state);
        } else {
          this.detenerTemporizadorLocal();
        }

        if (state?.ganador) {
          const isTie = state.ganador === GameRole.Empate;
          let title = '';
          if (isTie) {
            title = 'El juego ha terminado en empate';
          } else {
            if (state.configuracion?.dosVsDos) {
              const rol1 = `${state.ganador}1`;
              const rol2 = `${state.ganador}2`;
              const u1 = state.jugadores[rol1] !== null ? state.usernames[rol1] : null;
              const u2 = state.jugadores[rol2] !== null ? state.usernames[rol2] : null;

              if (u1 && u2) {
                title = `Los jugadores ${u1} y ${u2} ${this.getSkinIcon(state.ganador)} han ganado la partida`;
              } else if (u1 || u2) {
                title = `El jugador ${u1 || u2} ${this.getSkinIcon(state.ganador)} ha ganado la partida`;
              } else {
                title = `El equipo ${this.getSkinIcon(state.ganador)} ha ganado la partida`;
              }
            } else {
              title = `El jugador ${state.usernames[state.ganador as string]} ${this.getSkinIcon(state.ganador)} ha ganado la partida`;
            }
          }
          Swal.fire({
            title: title,
            icon: isTie ? 'info' : 'success',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
          });
        }

        const isMajorChange = state?.estado !== previousState?.estado || prevCount !== newCount || state?.tableroActivo !== previousState?.tableroActivo;

        if (state && previousState && isMajorChange && 'startViewTransition' in document) {
          (document as any).startViewTransition(() => {
            this.gameState.set(state);
            this.cd.detectChanges();
          });
        } else {
          this.gameState.set(state);
        }

        lastState = state;
      });
    }, { allowSignalWrites: true });
  }

  ngOnInit() {
    this.websocketService.actualizarAmigos();
  }

  ngOnDestroy() {
    this.detenerTemporizadorLocal();
    if (this.websocketService.roomId) {
      this.websocketService.abandonarSalaLocal();
    }
    if (Swal.isVisible()) {
      Swal.close();
    }
  }

  iniciarTemporizadorLocal(state: estadoJuego) {
    this.detenerTemporizadorLocal();
    if (!state.configuracion || !state.ultimaActualizacionTurno) return;

    const tick = () => {
      const serverTimeNow = Date.now() - this.websocketService.timeOffset;
      let msPasados = serverTimeNow - state.ultimaActualizacionTurno!;
      if (msPasados < 0) msPasados = 0;
      let rest = state.configuracion!.tiempo - Math.floor(msPasados / 1000);
      if (rest < 0) rest = 0;
      if (rest > state.configuracion!.tiempo) rest = state.configuracion!.tiempo;
      this.ngZone.run(() => {
         this.tiempoRestante.set(rest);
      });
    };

    tick();
    this.timerInterval = setInterval(tick, 1000);
  }

  detenerTemporizadorLocal() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.tiempoRestante.set(0);
  }

  movimiento(tableroId: number, celdaId: number) {
    const state = this.gameState();
    const role = this.myRole();

    if (!state || !role) return;

    const tablero = state.tableros.find(t => t.id === tableroId);
    const celda = tablero?.celdas.find(c => c.id === celdaId);

    if (!tablero || !celda) return;

    const isGameWon = !!state.ganador || state.estado === 'esperando';
    const rolActual = state.ordenTurnos ? state.ordenTurnos[state.indiceTurnoActual!] : state.turnoActual;
    let isWrongTurn = rolActual !== role;

    if (rolActual && typeof rolActual === 'string' && rolActual !== 'E') {
      const isDisconnectedExpected = state.jugadores[rolActual] === null;
      if (isDisconnectedExpected && role.charAt(0) === rolActual.charAt(0)) {
        isWrongTurn = false;
      }
    }
    const isOccupied = celda.valor !== null;
    const isInactiveBoard = !this.tableroActivo(tableroId);

    if (isGameWon || isWrongTurn || isOccupied || isInactiveBoard) {
       this.audioService.playErrorSound();
       return;
    }

    this.websocketService.emitMove(tableroId, celdaId);
  }

  tableroObjetivo(tableroId: number): boolean {
    const state = this.gameState();
    if (!state || state.configuracion?.objetivo === 'mayoria' || !state.configuracion?.patronGanador || state.ganador) return false;

    const patron = state.configuracion.patronGanador;
    const mapeoPatrones: { [key: string]: number } = {
      '1ra Fila': 0, '2da Fila': 1, '3ra Fila': 2,
      '1ra Columna': 3, '2da Columna': 4, '3ra Columna': 5,
      'Diagonal Principal': 6, 'Diagonal Secundaria': 7
    };
    const patronesGanadores = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];

    if (patron === 'Cualquiera') {
      return true;
    }

    if (mapeoPatrones[patron] !== undefined) {
      const index = mapeoPatrones[patron];
      const celdasObjetivo = patronesGanadores[index];
      const pos = state.tableros.findIndex(t => t.id === tableroId);
      return celdasObjetivo.includes(pos);
    }
    return false;
  }

  tableroActivo(tableroId: number): boolean {
    const state = this.gameState();
    if (!state) return false;

    if (state.tableroActivo === null) {
      const tablero = state.tableros.find(t => t.id === tableroId);
      return tablero ? !tablero.celdas.every(c => c.valor !== null) : false;
    }

    const pos = state.tableros.findIndex(t => t.id === tableroId);
    return state.tableroActivo === pos;
  }

  getNombreTurno(): string {
    const state = this.gameState();
    if (!state || !state.turnoActual || state.turnoActual === GameRole.Empate || state.estado === 'esperando') return '';
    const rolActual = state.ordenTurnos ? state.ordenTurnos[state.indiceTurnoActual!] : state.turnoActual;
    let username = state.usernames[rolActual as string];

    if (rolActual && typeof rolActual === 'string' && state.jugadores[rolActual] === null) {
      const compa = state.ordenTurnos?.find((r: string) => r !== rolActual && r.charAt(0) === rolActual.charAt(0) && state.jugadores[r] !== null);
      if (compa) {
        username = state.usernames[compa];
      } else {
        username = 'Desconectado';
      }
    }

    return `${username} ${this.getSkinIcon(state.turnoActual)}`;
  }

  getNombreRol(): string {
    const role = this.myRole();
    if (!role) return '';
    if (role === GameRole.Espectador) return 'Espectador';
    const state = this.gameState();
    if (!state) return role;
    const username = state.usernames[role];
    return `${username} ${this.getSkinIcon(role)}`;
  }

  getUsernamesForTeam(team: string): string[] {
    const state = this.gameState();
    if (!state) return [];
    if (state.configuracion?.dosVsDos) {
      const u1 = state.usernames[`${team}1`];
      const u2 = state.usernames[`${team}2`];
      const names = [];
      if (u1) names.push(u1);
      if (u2) names.push(u2);
      return names;
    } else {
      const u = state.usernames[team];
      return u ? [u] : [];
    }
  }

  isCurrentTurnPlayer(team: string, username: string): boolean {
    const state = this.gameState();
    if (!state || !state.configuracion?.dosVsDos || !state.ordenTurnos || state.indiceTurnoActual === undefined) return false;
    const rolActual = state.ordenTurnos[state.indiceTurnoActual];
    if (!rolActual || !rolActual.startsWith(team)) return false;
    return state.usernames[rolActual] === username;
  }

  getPuntos(team: string): number {
    const state = this.gameState();
    if (!state) return 0;
    return state.tableros.filter(t => t.ganador === team).length * 10;
  }

  get turnosFaltantesParaMover(): number {
    const state = this.gameState();
    if (!state || !state.configuracion?.tablerosMoviles) return 0;

    let turnosJugados = 0;
    for (const t of state.tableros) {
      for (const c of t.celdas) {
        if (c.valor) turnosJugados++;
      }
    }

    const remaining = 10 - (turnosJugados % 10);
    return remaining;
  }

  mostrarInfoConfiguracion() {
    const state = this.gameState();
    if (!state || !state.configuracion) return;
    const config = state.configuracion;

    let htmlContent = `<div style="text-align: left; padding: 10px; font-size: 1.1rem; line-height: 1.6;">`;

    htmlContent += `<p><strong>Sala:</strong> ${this.websocketService.roomId}</p>`;

    if (config.temporizador) {
      htmlContent += `<p>⏱️ <strong>Temporizador:</strong> ${config.tiempo} segundos</p>`;
    }

    htmlContent += `<p>${config.objetivo === 'mayoria' ? '🏆' : '🎯'} <strong>Objetivo:</strong> ${config.objetivo === 'mayoria' ? 'Mayoría de Triquis' : 'Triqui Doble'}</p>`;
    htmlContent += `<p>${config.modoSeleccion === 'Aleatorio' ? '🎲' : '✨'} <strong>Selección:</strong> ${config.modoSeleccion === 'Aleatorio' ? 'Aleatorio' : 'Regla de Oro'}</p>`;

    if (config.patronGanador !== "Cualquiera") {
      htmlContent += `<p>🧩 <strong>Patrón:</strong> ${config.patronGanador}</p>`;
    }

    if (config.tablerosMoviles) {
      htmlContent += `<p>🔄 <strong>Tableros Móviles:</strong> Sí (Faltan ${this.turnosFaltantesParaMover} turnos para moverse)</p>`;
    }

    if (config.robarTableros) {
      htmlContent += `<p>🥷 <strong>Robar Tableros:</strong> Sí</p>`;
    }

    if (config.dosVsDos) {
      htmlContent += `<p>👥 <strong>Juego:</strong> 2 vs 2</p>`;
    }

    if (config.salaPrivada) {
      htmlContent += `<p>🔒 <strong>Privacidad:</strong> Sala Privada</p>`;
    }

    htmlContent += `</div>`;

    Swal.fire({
      title: 'Configuración de la Partida',
      html: htmlContent,
      background: '#16213e',
      color: '#fff',
      confirmButtonColor: '#e94560',
      confirmButtonText: 'Entendido',
      customClass: {
        popup: 'glass-modal'
      }
    });
  }

  rendirse() {
    Swal.fire({
      title: '¿Estás seguro de que quieres rendirte?',
      icon: 'warning',
      background: '#16213e',
      color: '#fff',
      confirmButtonColor: '#e94560',
      showCancelButton: true,
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, rendirme',
      cancelButtonText: 'Cancelar'
    }).then((result) => {
      if (result.isConfirmed) {
        this.websocketService.emitRendirse();
      }
    });
  }

  volverAlMenu() {
    this.websocketService.leaveRoom();
  }

  reiniciarJuego() {
    this.websocketService.emitReset();
  }

  trackById(index: number, tablero: any): number {
    return tablero.id;
  }

  getSkinIcon(valor: string | null): string {
    if (!valor || valor === 'E') return valor || '';
    const state = this.gameState();
    if (!state || !state.skins) return valor.charAt(0);
    const equipo = valor.charAt(0);
    return state.skins[equipo]?.emoji || equipo;
  }

  getSkinColor(valor: string | null): string {
    if (!valor || valor === 'E') return '';
    const state = this.gameState();
    if (!state || !state.skins) return '';
    const equipo = valor.charAt(0);
    return state.skins[equipo]?.color || '';
  }

  getCellBackground(ganador: string | null): string {
    if (!ganador) return '';
    if (ganador === 'E') return 'rgba(100, 100, 100, 0.3)';
    const color = this.getSkinColor(ganador);
    if (!color) return '';
    return color + '99';
  }

  isSkinOptionDisabled(tipo: 'emoji' | 'color', valor: string): boolean {
    const state = this.gameState();
    const role = this.myRole();
    if (!state || !state.skins || !role) return false;

    const miEquipo = role.charAt(0);
    const rival = miEquipo === 'X' ? 'O' : 'X';

    return state.skins[rival]?.[tipo] === valor;
  }

  seleccionarSkin(tipo: 'emoji' | 'color', valor: string) {
    if (this.isSkinOptionDisabled(tipo, valor)) return;
    this.websocketService.seleccionarSkin(tipo, valor);
  }

  toggleListo() {
    this.websocketService.toggleListo();
  }

  abrirInvitacionAmigos() {
    const todosLosAmigos = this.websocketService.amigos().filter(a => a.estado === 'aceptado');

    if (todosLosAmigos.length === 0) {
      Swal.fire({
        title: 'No tienes amigos',
        text: 'Agrega amigos desde el lobby para poder invitarlos a jugar.',
        icon: 'info',
        background: '#16213e',
        color: '#fff'
      });
      return;
    }

    Swal.fire({
      title: 'Invitar Amigo',
      background: '#16213e',
      color: '#fff',
      html: `
        <div style="display: flex; flex-direction: column; gap: 10px; max-height: 300px; overflow-y: auto; padding: 10px;">
          ${todosLosAmigos.map(a => {
            const isOnline = this.websocketService.amigosOnline().has(a.username);
            return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px;">
              <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 50%; background: ${isOnline ? '#28a745' : '#e94560'}; box-shadow: 0 0 5px ${isOnline ? '#28a745' : '#e94560'};"></div>
                <span style="font-weight: 500;">${a.username}</span>
              </div>
              <button id="invite-${a.username}"
                class="swal2-confirm swal2-styled"
                style="margin: 0; padding: 5px 15px; font-size: 0.9rem; transition: all 0.3s; ${isOnline ? '' : 'background-color: #6c757d !important; cursor: not-allowed; opacity: 0.6;'}"
                ${isOnline ? '' : 'disabled'}>
                Invitar
              </button>
            </div>
            `;
          }).join('')}
        </div>
      `,
      showConfirmButton: false,
      didOpen: () => {
        todosLosAmigos.forEach(a => {
          const isOnline = this.websocketService.amigosOnline().has(a.username);
          if (isOnline) {
            const btn = document.getElementById(`invite-${a.username}`);
            if (btn) {
              btn.addEventListener('click', () => {
                this.websocketService.invitarAmigo(a.username, this.websocketService.roomId);
                Swal.close();
                const Toast = Swal.mixin({
                  toast: true,
                  position: 'top-end',
                  showConfirmButton: false,
                  timer: 3000,
                  background: '#16213e',
                  color: '#fff'
                });
                Toast.fire({ icon: 'success', title: `Invitación enviada a ${a.username}` });
              });
            }
          }
        });
      }
    });
  }
}
