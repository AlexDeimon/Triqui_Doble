import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { LobbyComponent } from './components/lobby/lobby';
import { TableroComponent } from './components/tablero/tablero';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: 'lobby', component: LobbyComponent },
  { path: 'tablero', component: TableroComponent },
  { path: '', redirectTo: 'login', pathMatch: 'full' },
];
