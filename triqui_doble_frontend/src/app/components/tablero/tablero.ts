import { Component, OnInit, NgZone, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { estadoJuego } from '../../models/game';
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

export class TableroComponent implements OnInit {

  gameState = signal<estadoJuego | null>(null);
  myRole = signal<string>('');

  constructor(
    public websocketService: WebsocketService,
    private ngZone: NgZone,
    private audioService: AudioService,
    private router: Router
  ) { }

  ngOnInit() {
    this.websocketService.gameState$.subscribe((state) => {
      this.ngZone.run(() => {
        const previousState = this.gameState();

        const getOccupiedCount = (s: estadoJuego | null) =>
          s ? s.tableros.reduce((acc, t) => acc + t.celdas.filter(c => c.valor !== null).length, 0) : 0;

        const prevCount = getOccupiedCount(previousState);
        const newCount = getOccupiedCount(state);

        if (state && prevCount < newCount) {
           this.audioService.playMoveSound();
        }

        this.gameState.set(state);

        if (state?.ganador) {
          const isTie = state.ganador === 'E';
          Swal.fire({
            title: isTie ? 'El juego ha terminado en empate' : `El jugador ${state.ganador} ha ganado la partida`,
            icon: isTie ? 'info' : 'success',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
          });
        }
      });
    });

    this.websocketService.myRole$.subscribe((role) => {
      this.ngZone.run(() => {
        this.myRole.set(role);
      });
    });
  }

  movimiento(tableroId: number, celdaId: number) {
    const state = this.gameState();
    const role = this.myRole();

    if (!state || !role) return;

    const tablero = state.tableros.find(t => t.id === tableroId);
    const celda = tablero?.celdas.find(c => c.id === celdaId);

    if (!tablero || !celda) return;

    const isGameWon = !!state.ganador;
    const isWrongTurn = state.turnoActual !== role;
    const isOccupied = celda.valor !== null;
    const isInactiveBoard = !this.tableroActivo(tableroId);

    if (isGameWon || isWrongTurn || isOccupied || isInactiveBoard) {
       this.audioService.playErrorSound();
       return;
    }

    this.websocketService.emitMove(tableroId, celdaId);
  }

  tableroActivo(tableroId: number): boolean {
    const state = this.gameState();
    if (!state) return false;

    if (state.tableroActivo === null) {
      const tablero = state.tableros.find(t => t.id === tableroId);
      return tablero ? !tablero.celdas.every(c => c.valor !== null) : false;
    }

    return state.tableroActivo === tableroId;
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
}
