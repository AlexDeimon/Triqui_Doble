import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import { Partidas } from './models/game.js';
import { connectDB } from './config/db.js';

connectDB();

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let jugadores = { X: null, O: null };

let estadojuego = {
  tableros: [],
  turnoActual: 'X',
  tableroActivo: null,
  ganador: null,
  cantidadTurnos: 0
};

const patronesGanadores = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
];

function verificarGanador(elementos, propiedad) {
  for (const [a, b, c] of patronesGanadores) {
    if (elementos[a][propiedad] &&
        elementos[a][propiedad] === elementos[b][propiedad] &&
        elementos[a][propiedad] === elementos[c][propiedad]) {
      return elementos[a][propiedad];
    }
  }
  return null;
}

function reiniciarJuego() {
  estadojuego.tableros = Array.from({ length: 9 }, (_, i) => ({
    id: i,
    ganador: null,
    habilitado: true,
    celdas: Array.from({ length: 9 }, (_, j) => ({ id: j, valor: null }))
  }));
  estadojuego.turnoActual = 'X';
  estadojuego.tableroActivo = null;
  estadojuego.ganador = null;
  console.log("Juego reiniciado");
}

reiniciarJuego();

io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);

  let roljugador = null;

  if (!jugadores.X) {
    jugadores.X = socket.id;
    roljugador = 'X';
  } else if (!jugadores.O) {
    jugadores.O = socket.id;
    roljugador = 'O';
  }

  socket.emit('init', { 
    role: roljugador, 
    state: estadojuego 
  });

  socket.on('Movimiento', async ({ tableroId, celdaId }) => {
    if (estadojuego.ganador) return;

    estadojuego.cantidadTurnos++;
    
    if (estadojuego.turnoActual !== roljugador) return;
    
    if (estadojuego.tableroActivo !== null && estadojuego.tableroActivo !== tableroId) {
      return;
    }

    const tablero = estadojuego.tableros[tableroId];

    const celda = tablero.celdas[celdaId];

    if (celda.valor !== null) return;

    celda.valor = roljugador;

    if (!tablero.ganador) {
      const ganadorTablero = verificarGanador(tablero.celdas, 'valor');
      if (ganadorTablero) {
        tablero.ganador = ganadorTablero;
        console.log(`Tablero ${tableroId} ganado por ${ganadorTablero}`);
      } else if (tablero.celdas.every(c => c.valor !== null)) {
         tablero.ganador = 'E';
         console.log(`Tablero ${tableroId} terminado en empate`);
      }
    }

    const ganadorGeneral = verificarGanador(estadojuego.tableros, 'ganador');
    if (ganadorGeneral) {
      estadojuego.ganador = ganadorGeneral;
      console.log(`Juego ganado por ${ganadorGeneral}`);
      try {
        const partida = new Partidas({
          ganador: ganadorGeneral,
          cantidadTurnos: estadojuego.cantidadTurnos
        });
        await partida.save();
        console.log('Partida guardada');
      } catch (error) {
        console.error('Error al guardar la partida:', error);
      }
    } else {
        const todosTablerosTerminados = estadojuego.tableros.every(t => t.ganador !== null);
        if (todosTablerosTerminados) {
            estadojuego.ganador = 'E';
            console.log("Juego terminado en empate global");
        }
    }
    
    const nextTablero = estadojuego.tableros[celdaId];
    const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

    if (isNextFull) {
        estadojuego.tableroActivo = null;
    } else {
        estadojuego.tableroActivo = celdaId;
    }

    estadojuego.turnoActual = estadojuego.turnoActual === 'X' ? 'O' : 'X';
    io.emit('actualizarJuego', estadojuego);
  });

  socket.on('disconnect', () => {
    console.log(`Jugador desconectado: ${socket.id}`);
    if (jugadores.X === socket.id) jugadores.X = null;

    if (jugadores.O === socket.id) jugadores.O = null;
    
    reiniciarJuego();
    io.emit('actualizarJuego', estadojuego);
  });

  socket.on('ReiniciarJuego', () => {
    reiniciarJuego();
    io.emit('actualizarJuego', estadojuego);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});