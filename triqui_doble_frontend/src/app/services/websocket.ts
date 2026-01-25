import { Injectable, NgZone, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { estadoJuego } from '../models/game';
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

  public gameState$ = new BehaviorSubject<estadoJuego | null>(null);
  public myRole$ = new BehaviorSubject<string>('');
  public loading = signal<boolean>(true);

  constructor(private http: HttpClient, private router: Router, private ngZone: NgZone) {
    this.socket = io(this.url);

    this.socket.on('connect', () => {
      this.ngZone.run(() => {
        console.log('Conectado al servidor');
        this.loading.set(false);
      });
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
        this.gameState$.next(state);
      });
    });

    this.socket.on('salaUnida', (data: { roomId: string, jugador: string }) => {
      this.ngZone.run(() => {
        console.log('Sala unida:', data);
        this.roomId = data.roomId;
        this.myRole$.next(data.jugador);
        this.router.navigate(['/tablero']);
      });
    });

    this.socket.on('salaCreada', (data: { roomId: string, jugador: string }) => {
      this.ngZone.run(() => {
        console.log('Sala creada:', data);
        this.roomId = data.roomId;
        this.myRole$.next(data.jugador);
        this.router.navigate(['/tablero']);
      });
    });

    this.socket.on('jugadorDesconectado', (msg: string) => {
      console.log('Mensaje de desconexión recibido:', msg);
      this.ngZone.run(() => {
        Swal.fire({
          title: msg,
          icon: 'warning',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        this.roomId = '';
        this.gameState$.next(null);
        this.router.navigate(['/lobby']);
      });
    });

    this.socket.on('error', (msg: string) => {
      this.ngZone.run(() => {
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
  }

  login(username: string, password: string): Observable<any> {
    this.username = username;
    return this.http.post(`${this.url}/login`, { username, password });
  }

  registrar(username: string, password: string): Observable<any> {
    return this.http.post(`${this.url}/registrar`, { username, password });
  }

  crearSala(roomId: string) {
    this.socket.emit('crearSala', { roomId, username: this.username });
  }

  unirseSala(roomId: string) {
    this.socket.emit('unirseASala', { roomId, username: this.username });
  }

  emitMove(tableroId: number, celdaId: number) {
    this.socket.emit('Movimiento', {
      roomId: this.roomId,
      tableroId,
      celdaId
    });
  }

  emitReset() {
    this.socket.emit('reiniciarJuego', this.roomId);
  }
}
