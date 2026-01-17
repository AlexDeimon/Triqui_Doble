import { Component, OnInit, NgZone, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { estadoJuego } from '../../models/game';
import { WebsocketService } from '../../services/websocket';

@Component({
  selector: 'app-tablero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tablero.html',
  styleUrl: './tablero.css'
})

export class TableroComponent implements OnInit {

  gameState = signal<estadoJuego | null>(null);
  myRole = signal<string>('');

  constructor(private websocketService: WebsocketService, private ngZone: NgZone) { }

  ngOnInit() {
    this.websocketService.gameState$.subscribe((state) => {
      this.ngZone.run(() => {
        console.log('Estado de juego:', state);
        this.gameState.set(state);
      });
    });

    this.websocketService.myRole$.subscribe((role) => {
      this.ngZone.run(() => {
        this.myRole.set(role);
      });
    });
  }

  movimiento(tableroId: number, celdaId: number) {
    this.websocketService.emitMove(tableroId, celdaId);
  }

  tableroActivo(tableroId: number): boolean {
    const state = this.gameState();
    if (!state) return false;
    return state.tableroActivo === null || state.tableroActivo === tableroId;
  }

  reiniciar() {
    this.websocketService.emitReset();
  }
}
