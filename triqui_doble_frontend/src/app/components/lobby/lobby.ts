import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket';
import { ModalHistoryService } from '../../services/modal-history';
import Swal from 'sweetalert2';

import { ProfileModalComponent } from '../profile-modal/profile-modal';
import { TutorialModalComponent } from '../tutorial-modal/tutorial-modal';

@Component({
  standalone: true,
  selector: 'app-lobby',
  imports: [CommonModule, FormsModule, ProfileModalComponent, TutorialModalComponent],
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
  solitario: boolean = false;
  dificultadBot: string = 'facil';

  private closePerfilHandler: (() => void) | null = null;
  private closeRankingHandler: (() => void) | null = null;
  private closeTutorialHandler: (() => void) | null = null;
  private closeConfigHandler: (() => void) | null = null;

  constructor(private router: Router, public websocketService: WebsocketService, private ngZone: NgZone, private cd: ChangeDetectorRef, private modalHistory: ModalHistoryService) { }

  ngOnInit() {
    if(this.urlParams['primerLogin'] === 'true'){
      this.primerLogin = true;
      const unregisterSwal = this.modalHistory.pushModal(() => {
        if (Swal.isVisible()) Swal.close();
      });
      Swal.fire({
        title: `Bienvenid@ ${this.websocketService.username} a Triqui Doble`,
        text: 'Para comenzar, ve al tutorial para aprender las reglas del juego',
        icon: 'success',
        background: '#16213e',
        color: '#fff',
        confirmButtonColor: '#e94560',
        didClose: () => unregisterSwal()
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
    if (this.mostrarRanking) {
      this.cerrarRanking();
    }
    if (!this.mostrarPerfil) {
      this.mostrarPerfil = true;
      this.closePerfilHandler = this.modalHistory.pushModal(() => {
        this.mostrarPerfil = false;
        this.selectedProfileUser = '';
        this.cd.detectChanges();
      });
    }
  }

  cerrarPerfil() {
    this.mostrarPerfil = false;
    this.selectedProfileUser = '';
    if (this.closePerfilHandler) {
      this.closePerfilHandler();
      this.closePerfilHandler = null;
    }
    this.cd.detectChanges();
  }

  abrirConfiguracionSala() {
    if (!this.mostrarConfiguracionSala) {
      this.mostrarConfiguracionSala = true;
      this.closeConfigHandler = this.modalHistory.pushModal(() => {
        this.mostrarConfiguracionSala = false;
        this.resetConfigFields();
        this.cd.detectChanges();
      });
    }
  }

  cerrarConfiguracionSala() {
    this.mostrarConfiguracionSala = false;
    this.resetConfigFields();
    if (this.closeConfigHandler) {
      this.closeConfigHandler();
      this.closeConfigHandler = null;
    }
    this.cd.detectChanges();
  }

  private resetConfigFields() {
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
    this.solitario = false;
    this.dificultadBot = 'facil';
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
      if (this.solitario){
        this.dificultadBot = ['facil', 'intermedio', 'dificil'][Math.floor(Math.random() * 3)];
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
      salaPrivada: this.salaPrivada,
      solitario: this.solitario,
      ...(this.solitario ? { dificultadBot: this.dificultadBot } : {})
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
        if (!this.mostrarRanking) {
          this.mostrarRanking = true;
          this.closeRankingHandler = this.modalHistory.pushModal(() => {
            this.mostrarRanking = false;
            this.cd.detectChanges();
          });
        }
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error obteniendo ranking:', err);
      }
    });
  }

  cerrarRanking() {
    this.mostrarRanking = false;
    if (this.closeRankingHandler) {
      this.closeRankingHandler();
      this.closeRankingHandler = null;
    }
    this.cd.detectChanges();
  }

  verTutorial() {
    if (!this.mostrarTutorial) {
      this.mostrarTutorial = true;
      this.closeTutorialHandler = this.modalHistory.pushModal(() => {
        this.mostrarTutorial = false;
        this.primerLogin = false;
        this.cd.detectChanges();
      });
    }
  }

  cerrarTutorial() {
    this.mostrarTutorial = false;
    this.primerLogin = false;
    if (this.closeTutorialHandler) {
      this.closeTutorialHandler();
      this.closeTutorialHandler = null;
    }
    this.cd.detectChanges();
    this.router.navigate(['/lobby'], { replaceUrl: true });
  }

  iniciarPartidaPractica() {
    this.solitario = true;
    this.dificultadBot = 'facil';
    this.objetivoJuego = 'triqui_doble';
    this.modoSeleccion = 'regla_oro';
    this.patronGanador = 'Cualquiera';
    this.tablerosMoviles = false;
    this.robarTableros = false;
    this.dosVsDos = false;
    this.habilitarTemporizador = false;
    this.salaPrivada = true;
    this.crearSala();
  }
}
