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
  ranking: any[] = [];
  mostrarRanking: boolean = false;
  mostrarTutorial: boolean = false;

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

  verRanking() {
    this.websocketService.obtenerRanking().subscribe((ranking) => {
      this.ranking = ranking;
      this.mostrarRanking = true;
    });
  }

  cerrarRanking() {
    this.mostrarRanking = false;
  }

  verTutorial() {
    this.mostrarTutorial = true;
  }

  cerrarTutorial() {
    this.mostrarTutorial = false;
  }

}
