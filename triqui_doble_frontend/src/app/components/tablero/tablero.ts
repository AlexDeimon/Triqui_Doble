import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { estadoJuego, tableroPequeño } from '../../models/game';

@Component({
  selector: 'app-tablero',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tablero.html',
  styleUrl: './tablero.css'
})

export class TableroComponent implements OnInit {

  gameState: estadoJuego = {
    tableros: [],
    turnoActual: 'X',
    tableroActivo: null,
    ganador: null
  };

  ngOnInit() {
    this.inicializar();
  }

  inicializar() {
    this.gameState.tableros = Array.from({ length: 9 }, (_, i) => {
      return {
        id: i,
        ganador: null,
        habilitado: true,
        celdas: Array.from({ length: 9 }, (_, j) => ({
          id: j,
          valor: null
        }))
      } as tableroPequeño;
    });
  }

  movimiento(tableroId: number, celdaId: number) {
    console.log(`Click en Tablero ${tableroId}, Celda ${celdaId}`);
  }
}
