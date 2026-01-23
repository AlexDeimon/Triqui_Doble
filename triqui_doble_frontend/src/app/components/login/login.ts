import { Component } from '@angular/core';
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
export class LoginComponent {
  username: string = '';
  password: string = '';
  usuarioRegistrado: boolean = true;

  constructor(private router: Router, private websocketService: WebsocketService) { }

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
      this.websocketService.registrar(this.username, this.password).subscribe({
        next: () => {
          Swal.fire({
            title: 'Usuario registrado exitosamente',
            icon: 'success',
            background: '#16213e',
            color: '#fff',
            confirmButtonColor: '#e94560'
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
