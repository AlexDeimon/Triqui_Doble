import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebsocketService } from '../../services/websocket';

@Component({
  standalone: true,
  selector: 'app-lobby',
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class LobbyComponent {
  codigoSala: string = '';

  constructor(public websocketService: WebsocketService) { }

  crearSala() {
    const codigoRandom = Math.random().toString(36).substring(7).toUpperCase();
    this.websocketService.crearSala(codigoRandom);
  }

  unirseSala() {
    if (this.codigoSala) {
      this.websocketService.unirseSala(this.codigoSala);
    }
  }

}
