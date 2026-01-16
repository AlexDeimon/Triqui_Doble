import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject } from 'rxjs';
import { estadoJuego } from '../models/game';

@Injectable({
  providedIn: 'root'
})

export class WebsocketService {
  private socket: Socket;
  private url = 'http://localhost:3000';

  public gameState$ = new BehaviorSubject<estadoJuego | null>(null);
  public myRole$ = new BehaviorSubject<string>('');

  constructor() {
    this.socket = io(this.url);

    this.socket.on('init', (data: { role: string, state: estadoJuego }) => {
      console.log('Rol asignado:', data.role);
      this.myRole$.next(data.role);
      this.gameState$.next(data.state);
    });

    this.socket.on('actualizarJuego', (state: estadoJuego) => {
      this.gameState$.next(state);
    });
  }

  emitMove(tableroId: number, celdaId: number) {
    this.socket.emit('Movimiento', { tableroId, celdaId });
  }
}
