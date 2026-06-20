import { Component, Input, Output, EventEmitter, ChangeDetectorRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { WebsocketService } from '../../services/websocket';
import Swal from 'sweetalert2';

@Component({
  standalone: true,
  selector: 'app-profile-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-modal.html',
  styleUrl: './profile-modal.css',
})

export class ProfileModalComponent implements OnChanges {
  @Input() username: string = '';
  @Input() showModal: boolean = false;
  @Output() close = new EventEmitter<void>();

  perfilData: any = null;
  historial: any[] = [];
  queryBusqueda: string = '';
  resultadosBusqueda: any[] = [];
  perfilTabActive: number = 0;
  iconosPerfil: string[] = ['🛡️', '⚔️', '💀', '👽', '🚀', '⭐', '🥷'];

  constructor(public websocketService: WebsocketService, private cd: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['showModal'] && changes['showModal'].currentValue) {
      this.cargarPerfil();
    }
  }

  get isMyProfile(): boolean {
    return this.username === this.websocketService.username;
  }

  cargarPerfil() {
    this.perfilTabActive = 0;
    this.websocketService.actualizarAmigos();

    this.websocketService.obtenerPerfil(this.username).subscribe({
      next: (perfil) => {
        this.perfilData = perfil;
        this.cd.detectChanges();
      },
      error: (err) => console.error('Error obteniendo perfil:', err)
    });

    if (this.isMyProfile) {
      this.websocketService.obtenerHistorial(this.username).subscribe({
        next: (historial) => {
          this.historial = historial;
          this.cd.detectChanges();
        },
        error: (err) => console.error('Error obteniendo historial:', err)
      });
    }
  }

  cerrar() {
    this.close.emit();
    this.queryBusqueda = '';
    this.resultadosBusqueda = [];
  }

  setPerfilTab(index: number) {
    this.perfilTabActive = index;
  }

  cambiarIconoPerfil(icono: string) {
    if (!this.isMyProfile) return;
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

  get friendStatus(): string {
    const amigo = this.websocketService.amigos().find(a => a.username === this.username);
    return amigo ? amigo.estado : 'none';
  }
}
