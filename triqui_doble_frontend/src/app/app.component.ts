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

  constructor(private wsService: WebsocketService) {}

  ngOnInit() {
    console.log('App iniciada, esperando conexión...');
  }
}
