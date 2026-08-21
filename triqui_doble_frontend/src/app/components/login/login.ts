import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { WebsocketService } from '../../services/websocket';
import Swal from 'sweetalert2';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent implements OnInit {
  username: string = '';
  password: string = '';
  usuarioRegistrado: boolean = true;
  primerLogin: boolean = false;

  constructor(private router: Router, private websocketService: WebsocketService) { }

  ngOnInit() {
    if(this.verificarUsuario()){
      this.router.navigate(['/lobby']);
    }
  }

  verificarUsuario = ():boolean => {
  const usuario = localStorage.getItem('triqui_username');
  if (usuario) {
    return true;
  }
  return false;
}

  onSubmit() {
    if (this.usuarioRegistrado) {
      this.websocketService.login(this.username, this.password).subscribe({
        next: () => {
          this.router.navigate(['/lobby']);
        },
        error: (err) => {
          Swal.fire({
            title: err.error.msg || 'Error al iniciar sesión',
            icon: 'error',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
          });
        }
      });
    } else {
      if (!this.username || this.username.trim().length < 3) {
        Swal.fire({
          title: 'El usuario debe tener al menos 3 caracteres',
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        return;
      }
      if (this.username.length > 10) {
        Swal.fire({
          title: 'El usuario no debe superar los 10 caracteres',
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        return;
      }
      if (!/^[a-zA-Z0-9_]+$/.test(this.username)) {
        Swal.fire({
          title: 'El usuario solo puede contener letras, números y guión bajo',
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        return;
      }
      if (!this.password || this.password.length < 6) {
        Swal.fire({
          title: 'La contraseña debe tener al menos 6 caracteres',
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        return;
      }
      if (this.password.length > 30) {
        Swal.fire({
          title: 'La contraseña no debe superar los 30 caracteres',
          icon: 'error',
          background: '#16213e',
          color: '#fff',
          confirmButtonColor: '#e94560'
        });
        return;
      }

      this.websocketService.registrar(this.username, this.password).subscribe({
        next: () => {
          this.websocketService.login(this.username, this.password).subscribe({
            next: () => {
              this.primerLogin = true;
              this.router.navigate(['/lobby'], { queryParams: { primerLogin: this.primerLogin } });
            },
            error: (err) => {
              Swal.fire({
                title: err.error.msg || 'Error al iniciar sesión',
                icon: 'error',
                background: '#16213e',
                color: '#fff',
                confirmButtonColor: '#e94560'
              });
            }
          });
          this.usuarioRegistrado = true;
        },
        error: (err) => {
          Swal.fire({
            title: err.error.msg || 'Error al registrar usuario',
            icon: 'error',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
          });
        }
      });
    }
  }

}
