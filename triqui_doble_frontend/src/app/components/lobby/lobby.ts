import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket';
import Swal from 'sweetalert2';

import { ProfileModalComponent } from '../profile-modal/profile-modal';

@Component({
  standalone: true,
  selector: 'app-lobby',
  imports: [CommonModule, FormsModule, ProfileModalComponent],
  templateUrl: './lobby.html',
  styleUrl: './lobby.css',
})
export class LobbyComponent implements OnInit, OnDestroy {
  codigoSala: string = '';
  ranking: any[] = [];
  mostrarRanking: boolean = false;
  historial: any[] = [];
  mostrarTutorial: boolean = false;
  robarTableros: boolean = false;
  mostrarConfiguracionSala: boolean = false;
  habilitarTemporizador: boolean = false;
  tiempoTemporizador: number = 15;
  objetivoJuego: string = 'triqui_doble';
  modoSeleccion: string = 'regla_oro';
  patronGanador: string = 'Cualquiera';
  tablerosMoviles: boolean = false;
  dosVsDos: boolean = false;
  salaPrivada: boolean = false;
  mostrarPerfil: boolean = false;
  selectedProfileUser: string = '';
  ruletaAleatoria: boolean = false;
  primerLogin: boolean = false;
  urlParams = this.router.parseUrl(this.router.url).queryParams;

  constructor(private router: Router, public websocketService: WebsocketService, private ngZone: NgZone, private cd: ChangeDetectorRef) { }

  ngOnInit() {
    if(this.urlParams['primerLogin'] === 'true'){
      this.primerLogin = true;
      Swal.fire({
        title: `Bienvenid@ ${this.websocketService.username} a Triqui Doble`,
        text: 'Para comenzar, ve al tutorial para aprender las reglas del juego',
        icon: 'success',
        background: '#16213e',
        color: '#fff',
        confirmButtonColor: '#e94560'
      });
    }
    if(this.verificarUsuario()){
      this.websocketService.identificar();
    }
    else{
      this.router.navigate(['/login']);
    }
  }

  ngOnDestroy() {
  }

  verificarUsuario = ():boolean => {
  const usuario = localStorage.getItem('triqui_username');
  if (usuario) {
    return true;
  }
  return false;
}

  abrirPerfil(username: string = this.websocketService.username) {
    this.selectedProfileUser = username;
    this.mostrarRanking = false;
    this.mostrarPerfil = true;
  }

  cerrarPerfil() {
    this.mostrarPerfil = false;
    this.selectedProfileUser = '';
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
    this.patronGanador = 'Cualquiera';
    this.tablerosMoviles = false;
    this.robarTableros = false;
    this.dosVsDos = false;
    this.salaPrivada = false;
    this.ruletaAleatoria = false;
  }

  crearSala() {
    const codigoRandom = Math.random().toString(36).substring(7).toUpperCase();

    if (this.ruletaAleatoria) {
      this.objetivoJuego = ['triqui_doble', 'mayoria'][Math.floor(Math.random() * 2)];
      this.modoSeleccion = ['regla_oro', 'Aleatorio'][Math.floor(Math.random() * 2)];
      if (this.modoSeleccion === 'regla_oro') {
        this.patronGanador = ['Cualquiera', 'Aleatorio'][Math.floor(Math.random() * 2)];
        this.tablerosMoviles = Math.random() < 0.5;
      }
      this.robarTableros = Math.random() < 0.5;
      this.habilitarTemporizador = Math.random() < 0.5;
      if (this.habilitarTemporizador) {
        this.tiempoTemporizador = [15, 30, 60][Math.floor(Math.random() * 3)];
      }
      this.ruletaAleatoria = false;
    }

    if (this.objetivoJuego === 'mayoria') {
      this.patronGanador = 'Cualquiera';
      this.tablerosMoviles = false;
    }
    this.websocketService.crearSala(codigoRandom, {
      temporizador: this.habilitarTemporizador,
      tiempo: this.tiempoTemporizador,
      objetivo: this.objetivoJuego,
      modoSeleccion: this.modoSeleccion,
      patronGanador: this.patronGanador,
      tablerosMoviles: this.tablerosMoviles,
      robarTableros: this.robarTableros,
      dosVsDos: this.dosVsDos,
      salaPrivada: this.salaPrivada
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
    this.primerLogin = false;
    this.router.navigate(['/lobby']);
  }

}
