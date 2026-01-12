import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})

export class WebsocketService {
  private socket: Socket;
  private url = 'http://localhost:3000';

  constructor() {
    this.socket = io(this.url);

    this.socket.on('connect', () => {
      console.log('✅ Conectado al servidor con ID:', this.socket.id);
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Desconectado del servidor');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
