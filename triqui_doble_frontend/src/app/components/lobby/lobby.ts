import { Component, NgZone, ChangeDetectorRef, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket';
import Swal from 'sweetalert2';

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
  queryBusqueda: string = '';
  resultadosBusqueda: any[] = [];
  perfilTabActive: number = 0;
  ruletaAleatoria: boolean = false;
  perfilData: any = null;
  iconosPerfil: string[] = ['🛡️', '⚔️', '💀', '👽', '🚀', '⭐', '🥷'];

  constructor(private router: Router, public websocketService: WebsocketService, private ngZone: NgZone, private cd: ChangeDetectorRef) { }

  ngOnInit() {
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

  abrirPerfil() {
    this.mostrarPerfil = true;
    this.perfilTabActive = 0;
    this.websocketService.actualizarAmigos();

    this.websocketService.obtenerPerfil(this.websocketService.username).subscribe({
      next: (perfil) => {
        this.perfilData = perfil;
        this.cd.detectChanges();
      },
      error: (err) => console.error('Error obteniendo perfil:', err)
    });

    this.websocketService.obtenerHistorial(this.websocketService.username).subscribe({
      next: (historial) => {
        this.historial = historial;
        this.cd.detectChanges();
      },
      error: (err) => {
        console.error('Error obteniendo historial:', err);
      }
    });
  }

  cerrarPerfil() {
    this.mostrarPerfil = false;
    this.queryBusqueda = '';
    this.resultadosBusqueda = [];
  }

  setPerfilTab(index: number) {
    this.perfilTabActive = index;
  }

  cambiarIconoPerfil(icono: string) {
    this.websocketService.actualizarPerfil(this.websocketService.username, icono).subscribe({
      next: () => {
        if (this.perfilData) {
          this.perfilData.profileImage = icono;
        }
        this.cd.detectChanges();
      }
    });
  }

  buscarUsuarios() {
    if (this.queryBusqueda.length > 2) {
      this.websocketService.buscarUsuarios(this.queryBusqueda, this.websocketService.username).subscribe(users => {
        this.resultadosBusqueda = users;
        this.cd.detectChanges();
      });
    } else {
      this.resultadosBusqueda = [];
    }
  }

  enviarSolicitud(username: string) {
    this.websocketService.enviarSolicitud(username).subscribe({
      next: () => {
        this.websocketService.notificarSolicitudEnviada(username);
        this.websocketService.actualizarAmigos();
        this.queryBusqueda = '';
        this.resultadosBusqueda = [];
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 3000,
          background: '#16213e',
          color: '#fff'
        });
        Toast.fire({ icon: 'success', title: 'Solicitud enviada' });
      }
    });
  }

  aceptarSolicitud(username: string) {
    this.websocketService.aceptarSolicitud(username).subscribe({
      next: () => {
        this.websocketService.notificarSolicitudAceptada(username);
        this.websocketService.actualizarAmigos();
      }
    });
  }

  rechazarSolicitud(username: string) {
    this.websocketService.rechazarSolicitud(username).subscribe({
      next: () => this.websocketService.actualizarAmigos()
    });
  }

  eliminarAmigo(username: string) {
    Swal.fire({
      title: '¿Eliminar amigo?',
      text: `¿Estás seguro de que quieres eliminar a ${username}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e94560',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      background: '#16213e',
      color: '#fff'
    }).then((result) => {
      if (result.isConfirmed) {
        this.websocketService.eliminarAmigo(username).subscribe({
          next: () => this.websocketService.actualizarAmigos()
        });
      }
    });
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
  }

}
