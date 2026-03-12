import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebsocketService } from '../../services/websocket';
import { Subscription } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-lobby',
  imports: [CommonModule, FormsModule],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class LobbyComponent implements OnInit, OnDestroy {
  codigoSala: string = '';
  ranking: any[] = [];
  mostrarRanking: boolean = false;
  historial: any[] = [];
  mostrarHistorial: boolean = false;
  mostrarTutorial: boolean = false;
  salas: any[] = [];
  mostrarConfiguracionSala: boolean = false;
  habilitarTemporizador: boolean = false;
  tiempoTemporizador: number = 15;
  objetivoJuego: string = 'triqui_doble';
  modoSeleccion: string = 'regla_oro';
  private salasSub!: Subscription;

  constructor(public websocketService: WebsocketService, private ngZone: NgZone, private cd: ChangeDetectorRef) { }

  ngOnInit() {
    this.salasSub = this.websocketService.salasPublicas$.subscribe(salas => {
      this.salas = salas;
      this.cd.detectChanges();
    });
  }

  ngOnDestroy() {
    if (this.salasSub) {
      this.salasSub.unsubscribe();
    }
  }

  abrirConfiguracionSala() {
    this.mostrarConfiguracionSala = true;
  }

  cerrarConfiguracionSala() {
    this.mostrarConfiguracionSala = false;
    this.habilitarTemporizador = false;
    this.tiempoTemporizador = 15;
    this.objetivoJuego = 'triqui_doble';
    this.modoSeleccion = 'regla_oro';
  }

  crearSala() {
    const codigoRandom = Math.random().toString(36).substring(7).toUpperCase();
    this.websocketService.crearSala(codigoRandom, {
      temporizador: this.habilitarTemporizador,
      tiempo: this.tiempoTemporizador,
      objetivo: this.objetivoJuego,
      modoSeleccion: this.modoSeleccion
    });
    this.cerrarConfiguracionSala();
  }

  unirseSala() {
    if (this.codigoSala) {
      this.websocketService.unirseSala(this.codigoSala);
    }
  }

  unirseSalaEspecifica(roomId: string) {
    if (roomId) {
      this.codigoSala = roomId;
      this.unirseSala();
    }
  }

  verRanking() {
    this.websocketService.obtenerRanking().subscribe({
      next: (ranking) => {
        this.ranking = ranking;
        this.mostrarRanking = true;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error obteniendo ranking:', err);
      }
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

  verHistorial() {
    this.websocketService.obtenerHistorial(this.websocketService.username).subscribe({
      next: (historial) => {
        this.historial = historial;
        this.mostrarHistorial = true;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error obteniendo historial:', err);
      }
    });
  }

  cerrarHistorial() {
    this.mostrarHistorial = false;
  }

}
