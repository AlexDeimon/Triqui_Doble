import { Component, OnInit, OnDestroy, NgZone, signal, effect, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { estadoJuego, GameRole, PATRONES_GANADORES, MAPEO_PATRONES, calcularIndicesTablerosGanadores, obtenerSkinEmoji, obtenerSkinColor, obtenerFondoGanador, esTableroDisponible, calcularTableroBorderColor, calcularTableroBoxShadow } from '../../models/game';
import { WebsocketService } from '../../services/websocket';
import { AudioService } from '../../services/audio';
import { ModalHistoryService } from '../../services/modal-history';
import Swal from 'sweetalert2';
import { ProfileModalComponent } from '../profile-modal/profile-modal';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import confetti from 'canvas-confetti';

@Component({
  selector: 'app-tablero',
  standalone: true,
  imports: [CommonModule, ProfileModalComponent, FormsModule],
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
  mostrarPerfil: boolean = false;
  selectedProfileUser: string = '';
  chatMessages: { username: string, mensaje: string }[] = [];
  nuevoMensajeText: string = '';
  mostrarChat: boolean = false;
  chatSubscription?: Subscription;
  mensajesNoLeidos: number = 0;
  mostrarModalVictoria: boolean = false;

  private ultimoGanadorProcesado: string | null = null;
  @ViewChild('chatScroll') private chatScrollContainer!: ElementRef;
  private closePerfilHandler: (() => void) | null = null;
  private closeChatHandler: (() => void) | null = null;
  private closeVictoriaHandler: (() => void) | null = null;

  constructor(
    public websocketService: WebsocketService,
    private ngZone: NgZone,
    private audioService: AudioService,
    private router: Router,
    private cd: ChangeDetectorRef,
    private modalHistory: ModalHistoryService
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

        if (state?.ganador && this.ultimoGanadorProcesado !== state.ganador) {
          this.ultimoGanadorProcesado = state.ganador;
          this.mostrarModalVictoria = false;
          if (this.closeVictoriaHandler) {
            this.closeVictoriaHandler();
            this.closeVictoriaHandler = null;
          }

          this.closeVictoriaHandler = this.modalHistory.pushModal(() => {
            this.mostrarModalVictoria = false;
            this.cd.detectChanges();
          });

          const isTie = state.ganador === GameRole.Empate;
          let title = '';

          if (isTie) {
            title = 'El juego ha terminado en empate.';
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

          const miRol = this.myRole();
          const esGanador = miRol && miRol !== GameRole.Espectador && miRol.charAt(0) === state.ganador;

          if (!isTie && esGanador) {
            this.lanzarConfeti();
          }

          const unregisterSwal = this.modalHistory.pushModal(() => {
            if (Swal.isVisible()) Swal.close();
          });

          Swal.fire({
            title: title,
            icon: isTie ? 'info' : 'success',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560',
            didClose: () => unregisterSwal()
          });
          this.cd.detectChanges();

        } else if (!state?.ganador) {
          this.mostrarModalVictoria = false;
          if (this.closeVictoriaHandler) {
            this.closeVictoriaHandler();
            this.closeVictoriaHandler = null;
          }
          this.ultimoGanadorProcesado = null;
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
    if (!this.websocketService.roomId && !this.websocketService.gameState()) {
      this.router.navigate(['/lobby'], { replaceUrl: true });
      return;
    }
    this.websocketService.actualizarAmigos();
    this.chatSubscription = this.websocketService.escucharChat().subscribe(msg => {
      this.chatMessages.push(msg);
      if (!this.mostrarChat) {
        this.mensajesNoLeidos++;
      } else {
        this.scrollToBottom();
      }
    });
  }

  ngOnDestroy() {
    this.detenerTemporizadorLocal();

    if (this.websocketService.roomId) {
      this.websocketService.abandonarSalaLocal();
    }
    if (Swal.isVisible()) {
      Swal.close();
    }
    if (this.chatSubscription) {
      this.chatSubscription.unsubscribe();
    }
  }

  iniciarTemporizadorLocal(state: estadoJuego) {
    if (this.timerInterval) {
      cancelAnimationFrame(this.timerInterval);
      this.timerInterval = null;
    }
    if (!state.configuracion || !state.ultimaActualizacionTurno) return;

    this.tiempoRestante.set(state.configuracion.tiempo);

    let lastDisplayed = state.configuracion.tiempo;

    const tick = () => {
      const serverTimeNow = Date.now() - this.websocketService.timeOffset;
      let msPasados = serverTimeNow - state.ultimaActualizacionTurno!;
      if (msPasados < 0) msPasados = 0;
      let rest = state.configuracion!.tiempo - Math.floor(msPasados / 1000);
      if (rest < 0) rest = 0;
      if (rest > state.configuracion!.tiempo) rest = state.configuracion!.tiempo;

      if (rest !== lastDisplayed) {
        lastDisplayed = rest;
        this.ngZone.run(() => {
          this.tiempoRestante.set(rest);
        });
      }

      if (this.timerInterval) {
        this.timerInterval = requestAnimationFrame(tick);
      }
    };

    this.timerInterval = requestAnimationFrame(tick);
  }

  detenerTemporizadorLocal() {
    if (this.timerInterval) {
      cancelAnimationFrame(this.timerInterval);
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
    if (patron === 'Cualquiera') {
      return true;
    }

    if (MAPEO_PATRONES[patron] !== undefined) {
      const index = MAPEO_PATRONES[patron];
      const celdasObjetivo = PATRONES_GANADORES[index];
      const pos = state.tableros.findIndex(t => t.id === tableroId);
      return celdasObjetivo.includes(pos);
    }
    return false;
  }

  tableroActivo(tableroId: number): boolean {
    const state = this.gameState();
    if (!state || state.ganador) return false;

    if (state.tableroActivo === null) {
      const tablero = state.tableros.find(t => t.id === tableroId);
      return esTableroDisponible(tablero);
    }

    const pos = state.tableros.findIndex(t => t.id === tableroId);
    return state.tableroActivo === pos;
  }

  getTablerosGanadoresFinales(): Set<number> {
    const state = this.gameState();
    if (!state || !state.ganador || state.ganador === GameRole.Empate) return new Set();

    const winningIndices = calcularIndicesTablerosGanadores(state.tableros, state.ganador, state.configuracion);
    const winningBoardIds = new Set<number>();
    winningIndices.forEach(idx => {
      if (state.tableros[idx]) winningBoardIds.add(state.tableros[idx].id);
    });

    return winningBoardIds;
  }

  esTableroGanadorFinal(tableroId: number): boolean {
    return this.getTablerosGanadoresFinales().has(tableroId);
  }

  getTableroBorderColor(tableroId: number): string {
    const state = this.gameState();
    if (!state) return '';
    if (state.ganador && state.ganador !== GameRole.Empate) {
      return calcularTableroBorderColor(this.esTableroGanadorFinal(tableroId), this.getSkinColor(state.ganador));
    }
    return calcularTableroBorderColor(this.tableroActivo(tableroId), this.getSkinColor(state.turnoActual));
  }

  getTableroBoxShadow(tableroId: number): string {
    const state = this.gameState();
    if (!state) return '';
    if (state.ganador && state.ganador !== GameRole.Empate) {
      return calcularTableroBoxShadow(this.esTableroGanadorFinal(tableroId), this.getSkinColor(state.ganador), 18);
    }
    return calcularTableroBoxShadow(this.tableroActivo(tableroId), this.getSkinColor(state.turnoActual), 15);
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
    let result = state.tableros.filter(t => t.ganador === team).length * 10;
    if (state?.ganador === team) result = result + 50;
    return result;
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

    if (config.dificultadBot) {
      const dificultadTexto = config.dificultadBot.charAt(0).toUpperCase() + config.dificultadBot.slice(1);
      htmlContent += `<p>🤖 <strong>Dificultad:</strong> ${dificultadTexto}</p>`;
    }

    htmlContent += `</div>`;

    const unregisterSwal = this.modalHistory.pushModal(() => {
      if (Swal.isVisible()) Swal.close();
    });

    Swal.fire({
      title: 'Configuración de la Partida',
      html: htmlContent,
      background: '#16213e',
      color: '#fff',
      confirmButtonColor: '#e94560',
      confirmButtonText: 'Entendido',
      customClass: {
        popup: 'glass-modal'
      },
      didClose: () => unregisterSwal()
    });
  }

  rendirse() {
    const unregisterSwal = this.modalHistory.pushModal(() => {
      if (Swal.isVisible()) Swal.close();
    });

    Swal.fire({
      title: '¿Estás seguro de que quieres rendirte?',
      icon: 'warning',
      background: '#16213e',
      color: '#fff',
      confirmButtonColor: '#e94560',
      showCancelButton: true,
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Sí, rendirme',
      cancelButtonText: 'Cancelar',
      didClose: () => unregisterSwal()
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
    return obtenerSkinEmoji(valor, this.gameState()?.skins);
  }

  getSkinColor(valor: string | null): string {
    return obtenerSkinColor(valor, this.gameState()?.skins);
  }

  getCellBackground(ganador: string | null): string {
    return obtenerFondoGanador(ganador, this.getSkinColor(ganador), '99');
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
      const unregisterEmpty = this.modalHistory.pushModal(() => {
        if (Swal.isVisible()) Swal.close();
      });
      Swal.fire({
        title: 'No tienes amigos',
        text: 'Agrega amigos para poder invitarlos a jugar.',
        icon: 'info',
        background: '#16213e',
        color: '#fff',
        didClose: () => unregisterEmpty()
      });
      return;
    }

    const unregisterSwal = this.modalHistory.pushModal(() => {
      if (Swal.isVisible()) Swal.close();
    });

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
      didClose: () => unregisterSwal(),
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

  abrirPerfil(username: string) {
    if (username === 'Bot') return;
    if (username) {
      this.selectedProfileUser = username;
      if (!this.mostrarPerfil) {
        this.mostrarPerfil = true;
        this.closePerfilHandler = this.modalHistory.pushModal(() => {
          this.mostrarPerfil = false;
          this.selectedProfileUser = '';
          this.cd.detectChanges();
        });
      }
    }
  }

  cerrarPerfil() {
    this.mostrarPerfil = false;
    this.selectedProfileUser = '';
    if (this.closePerfilHandler) {
      this.closePerfilHandler();
      this.closePerfilHandler = null;
    }
    this.cd.detectChanges();
  }

  get isChatEnabled(): boolean {
    const state = this.gameState();
    if (!state?.configuracion) return false;
    if (state.configuracion.solitario && !state.configuracion.dosVsDos) return false;
    return true;
  }

  toggleChat() {
    if (!this.mostrarChat) {
      this.mostrarChat = true;
      this.mensajesNoLeidos = 0;
      this.scrollToBottom();
      this.closeChatHandler = this.modalHistory.pushModal(() => {
        this.mostrarChat = false;
        this.cd.detectChanges();
      });
    } else {
      this.mostrarChat = false;
      if (this.closeChatHandler) {
        this.closeChatHandler();
        this.closeChatHandler = null;
      }
    }
    this.cd.detectChanges();
  }

  scrollToBottom(): void {
    try {
      setTimeout(() => {
        if (this.chatScrollContainer) {
          this.chatScrollContainer.nativeElement.scrollTop = this.chatScrollContainer.nativeElement.scrollHeight;
        }
      }, 50);
    } catch(err) { }
  }

  enviarMensaje() {
    if (!this.nuevoMensajeText.trim()) return;
    const roomId = localStorage.getItem('triqui_roomId') || '';
    if (roomId) {
      this.websocketService.enviarMensajeChat(roomId, this.websocketService.username, this.nuevoMensajeText.trim());
      this.nuevoMensajeText = '';
    }
  }

  lanzarConfeti() {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        zIndex: 99999
      });
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          zIndex: 99999
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          zIndex: 99999
        });
      }, 250);
    } catch (e) {
      console.error('Error lanzando confeti:', e);
    }
  }
}
