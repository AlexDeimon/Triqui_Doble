import { Injectable, NgZone, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { estadoJuego, GameRole } from '../models/game';
import { environment } from '../../environments/environment';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Injectable({
  providedIn: 'root'
})

export class WebsocketService {
  private socket: Socket;
  private url = environment.apiUrl;

  public roomId: string = '';
  public username: string = '';

  public gameState = signal<estadoJuego | null>(null);
  public salasPublicas = signal<any[]>([]);
  public myRole = signal<GameRole | ''>('');
  public loading = signal<boolean>(true);
  public isReconnecting: boolean = false;
  public timeOffset: number = 0;

  constructor(private http: HttpClient, private router: Router, private ngZone: NgZone) {
    this.socket = io(this.url);

    const savedRoom = localStorage.getItem('triqui_roomId');
    const savedUser = localStorage.getItem('triqui_username');
    if (savedRoom && savedUser) {
        this.roomId = savedRoom;
        this.username = savedUser;
    }

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        console.log('Conectado al servidor');
        this.loading.set(false);

        if (this.roomId && this.username) {
            console.log('Intentando reconectar a sala:', this.roomId);
            this.isReconnecting = true;
            this.socket.emit('reconectar', { roomId: this.roomId, username: this.username });
        }
      });
    });

    this.socket.on('syncTime', (serverTime: number) => {
      this.timeOffset = Date.now() - serverTime;
    });

    this.socket.on('disconnect', () => {
      this.ngZone.run(() => {
        console.log('Desconectado del servidor');
        this.loading.set(true);
      });
    });

    this.socket.on('connect_error', () => {
      this.ngZone.run(() => {
        this.loading.set(true);
      });
    });

    this.socket.on('actualizarJuego', (state: estadoJuego) => {
      this.ngZone.run(() => {
        if (Swal.isVisible() && Swal.getTitle()?.textContent === 'Conexión Inestable') {
            if (state.jugadores.X && state.jugadores.O) {
                Swal.close();
            }
        }
        if ('startViewTransition' in document) {
            (document as any).startViewTransition(() => {
                this.gameState.set(state);
            });
        } else {
            this.gameState.set(state);
        }
      });
    });

    this.socket.on('salasDisponibles', (salas: any[]) => {
      this.ngZone.run(() => {
        this.salasPublicas.set(salas);
      });
    });

    this.socket.on('salaCreada', (data: { roomId: string, jugador: GameRole }) => {
      this.ngZone.run(() => {
        console.log('Sala creada:', data);
        this.isReconnecting = false;
        this.roomId = data.roomId;
        this.username = this.username;
        localStorage.setItem('triqui_roomId', this.roomId);
        localStorage.setItem('triqui_username', this.username);

        this.myRole.set(data.jugador);
        this.router.navigate(['/tablero']);
      });
    });

    this.socket.on('salaUnida', (data: { roomId: string, jugador: GameRole }) => {
      this.ngZone.run(() => {
        console.log('Sala unida:', data);
        this.isReconnecting = false;
        this.roomId = data.roomId;
        localStorage.setItem('triqui_roomId', this.roomId);
        if (this.username) localStorage.setItem('triqui_username', this.username);

        this.myRole.set(data.jugador);
        this.router.navigate(['/tablero']);
      });
    });

    this.socket.on('jugadorDesconectado', (msg: string) => {
      console.log('Mensaje de desconexión recibido:', msg);
      this.ngZone.run(() => {
        this.roomId = '';
        localStorage.removeItem('triqui_roomId');
        this.gameState.set(null);
        this.router.navigate(['/lobby']).then(() => {
          Swal.fire({
            title: msg,
            icon: 'warning',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
          });
        });
      });
    });

    this.socket.on('oponenteDesconectado', (msg: string) => {
      this.ngZone.run(() => {
        if (this.myRole() === GameRole.Espectador) return;
        Swal.fire({
          title: 'Conexión Inestable',
          text: msg,
          icon: 'info',
          background: '#16213e',
          color: '#fff',
          showConfirmButton: false,
          allowOutsideClick: false
        });
      });
    });

    this.socket.on('oponenteAbandonoVoluntario', (msg: string) => {
      this.ngZone.run(() => {
        if (this.myRole() === GameRole.Espectador) return;
        if (Swal.isVisible()) Swal.close();

        Swal.fire({
          title: 'Oponente retirado',
          text: msg,
          icon: 'warning',
          background: '#16213e',
          color: '#fff',
          showCancelButton: true,
          confirmButtonColor: '#e94560',
          cancelButtonColor: '#6c757d',
          confirmButtonText: 'Continuar',
          cancelButtonText: 'Salir',
          allowOutsideClick: false
        }).then((result) => {
          if (result.isDismissed) {
            this.leaveRoom();
          }
        });
      });
    });

    this.socket.on('error', (msg: string) => {
      this.ngZone.run(() => {
        if (this.isReconnecting && (msg === 'La partida ya no existe' || msg === 'La sala no existe')) {
          console.log('Reconexión fallida (sala no existe). Limpiando sesión.');
          this.roomId = '';
          localStorage.removeItem('triqui_roomId');
          localStorage.removeItem('triqui_username');
          this.isReconnecting = false;
          return;
        }

        this.isReconnecting = false;
        Swal.fire({
          title: 'Error',
          text: msg,
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
      });
    });

    this.socket.on('tiempoAgotado', (msg: string) => {
      this.ngZone.run(() => {
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          timerProgressBar: true,
          background: '#16213e',
          color: '#fff',
          didOpen: (toast) => {
            toast.addEventListener('mouseenter', Swal.stopTimer)
            toast.addEventListener('mouseleave', Swal.resumeTimer)
          }
        });

        Toast.fire({
          icon: 'warning',
          title: msg
        });
      });
    });
  }

  login(username: string, password: string): Observable<any> {
    this.username = username;
    return this.http.post(`${this.url}/login`, { username, password });
  }

  registrar(username: string, password: string): Observable<any> {
    return this.http.post(`${this.url}/registrar`, { username, password });
  }

  crearSala(roomId: string, configuracion?: any) {
    this.socket.emit('crearSala', { roomId, username: this.username, configuracion });
  }

  unirseSala(roomId: string) {
    this.socket.emit('unirseASala', { roomId, username: this.username });
  }

  obtenerRanking(): Observable<any[]> {
    return this.http.get<any[]>(`${this.url}/ranking`);
  }

  obtenerHistorial(username: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.url}/historial/${username}`);
  }

  emitMove(tableroId: number, celdaId: number) {
    this.socket.emit('Movimiento', {
      roomId: this.roomId,
      tableroId,
      celdaId
    });
  }

  emitRendirse() {
    this.socket.emit('rendirse', this.roomId);
  }

  emitReset() {
    this.socket.emit('reiniciarJuego', this.roomId);
  }

  abandonarSalaLocal() {
    if (this.roomId) {
      const role = this.myRole();
      if (role === GameRole.Espectador) {
        this.socket.emit('salirEspectador', this.roomId);
      } else {
        this.socket.emit('abandonarSala', this.roomId);
      }
      this.roomId = '';
      localStorage.removeItem('triqui_roomId');
      this.gameState.set(null);
      this.myRole.set('');
    }
  }

  leaveRoom() {
    if (this.roomId) {
      this.abandonarSalaLocal();
      this.router.navigate(['/lobby']);
    }
  }
}
