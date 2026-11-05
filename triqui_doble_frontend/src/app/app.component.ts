import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { WebsocketService } from './services/websocket';
import { TableroComponent } from './components/tablero/tablero';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, TableroComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent implements OnInit {
  title = 'frontend';
  loading = this.wsService.loading;
  tips = [
    {
      key: 'Regla de oro ✨',
      value: 'Tu movimiento determina en que Mini-tablero jugará tu oponente en su turno. ¡Piensa bien tu jugada!'
    },
    {
      key: 'Turno al azar 🎲',
      value: 'Los Mini-tableros en cada turno se seleccionan al azar. ¡Que la suerte este de tu lado!'
    },
    {
      key: 'Victoria por Triqui Doble 🎯',
      value: 'Ganas el juego si logras ganar 3 Mini-tableros en linea formando el triqui grande.'
    },
    {
      key: 'Victoria por mayoria 🏆',
      value: 'Enfocáte solo en ganar la mayoria de Mini-tableros antes que tu oponente.'
    },
    {
      key: 'Tableros moviles 🔄',
      value: 'Los tableros cambian de posición aleatoriamente cada 10 turnos. ¡Tu estrategia debe adaptarse sobre la marcha!'
    },
    {
      key: 'Robar tableros 🥷',
      value: 'Puedes robar un Mini-tablero de tu oponente si logras hacer otro 3 en linea. !No permitas que tu oponente te gane las diagonales!'
    },
    {
      key: 'Temporizador ⏱️',
      value: 'Tendrás un tiempo limite para hacer tu jugada. Si no lo haces perderás tu turno. !No te duermas!'
    }
  ]

  tipAleatorio = this.tips[Math.floor(Math.random() * this.tips.length)];

  constructor(private wsService: WebsocketService) { }

  ngOnInit() {
    console.log('App iniciada, esperando conexión...');
  }
}
