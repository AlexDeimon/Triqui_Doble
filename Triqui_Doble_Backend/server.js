import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import { connectDB } from './config/db.js';
import * as userController from './controllers/user.js';
import * as gameController from './controllers/game.js';

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000 
});

const juegos = new Map();
const timeoutsEliminacion = new Map();

app.post('/registrar', userController.registrar);
app.post('/login', userController.login);


io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);

  socket.on('crearSala', ({ roomId, username }) => {
    if (juegos.has(roomId)) {
      socket.emit('error', 'La sala ya existe');
      return;
    }

    const estadojuego = gameController.iniciarEstadoJuego();
    estadojuego.jugadores.X = socket.id;
    estadojuego.usernames.X = username;
    juegos.set(roomId, estadojuego);
    socket.join(roomId);
    console.log(`Jugador ${username} creó la sala ${roomId}`);
    socket.emit('salaCreada', {roomId, jugador: 'X'});
    io.to(roomId).emit('actualizarJuego', estadojuego);
  })

  socket.on('unirseASala', ({ roomId, username }) => {
    const juego = juegos.get(roomId);

    if (!juego) {
      socket.emit('error', 'La sala no existe');
      return;
    }

    if (juego.jugadores.O) {
      socket.emit('error', 'La sala esta llena');
      return;
    }

    juego.jugadores.O = socket.id;
    juego.usernames.O = username;
    socket.join(roomId);
    console.log(`Jugador ${username} se unio a la sala ${roomId}`);
    socket.emit('salaUnida', {roomId, jugador: 'O'});
    io.to(roomId).emit('actualizarJuego', juego);
  })

  socket.on('reconectar', ({ roomId, username }) => {
    const juego = juegos.get(roomId);
    if (!juego) {
        socket.emit('error', 'La partida ya no existe');
        return;
    }

    let rol = null;
    if (juego.usernames.X === username) rol = 'X';
    else if (juego.usernames.O === username) rol = 'O';

    if (rol) {
        console.log(`Jugador ${username} (${rol}) reconectado a sala ${roomId}`);
        
        if (timeoutsEliminacion.has(roomId)) {
            clearTimeout(timeoutsEliminacion.get(roomId));
            timeoutsEliminacion.delete(roomId);
            console.log(`Cancelada destrucción de sala ${roomId}`);
        }

        juego.jugadores[rol] = socket.id;
        socket.join(roomId);
        
        socket.emit('salaUnida', {roomId, jugador: rol}); 
        io.to(roomId).emit('actualizarJuego', juego);
    }
  });

  socket.on('Movimiento', async ({ roomId, tableroId, celdaId }) => {
    const juego = juegos.get(roomId);

    if (!juego) return;
    if (juego.ganador) return;

    const jugadorX = juego.jugadores.X === socket.id;
    const roljugador = jugadorX ? 'X' : 'O';
    
    if (juego.turnoActual !== roljugador) return;
    
    if (juego.tableroActivo !== null && juego.tableroActivo !== tableroId) {
      return;
    }

    const tablero = juego.tableros[tableroId];

    const celda = tablero.celdas[celdaId];

    if (celda.valor !== null) return;

    celda.valor = roljugador;
    juego.cantidadTurnos++;

    if (!tablero.ganador) {
      const ganadorTablero = gameController.verificarGanador(tablero.celdas, 'valor');
      if (ganadorTablero) {
        tablero.ganador = ganadorTablero;
        console.log(`Tablero ${tableroId} ganado por ${ganadorTablero}`);
      } else if (tablero.celdas.every(c => c.valor !== null)) {
         tablero.ganador = 'E';
         console.log(`Tablero ${tableroId} terminado en empate`);
      }
    }

    const ganadorGeneral = gameController.verificarGanador(juego.tableros, 'ganador');
    if (ganadorGeneral) {
      juego.ganador = ganadorGeneral;
      console.log(`Juego ganado por ${ganadorGeneral}`);
      gameController.guardarPartida(roomId, juego);
    } else {
        const todosTablerosTerminados = juego.tableros.every(t => t.ganador !== null);
        if (todosTablerosTerminados) {
            juego.ganador = 'E';
            console.log("Juego terminado en empate");
            gameController.guardarPartida(roomId, juego);
        }
    }
    
    const nextTablero = juego.tableros[celdaId];
    const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

    if (isNextFull) {
        juego.tableroActivo = null;
    } else {
        juego.tableroActivo = celdaId;
    }

    juego.turnoActual = juego.turnoActual === 'X' ? 'O' : 'X';
    io.to(roomId).emit('actualizarJuego', juego);
  });

  socket.on('reiniciarJuego', (roomId) => {
    const juego = juegos.get(roomId);
    if (!juego) return;
    
    const jugadoresRef = { ...juego.jugadores };
    const usernamesRef = { ...juego.usernames };
    
    const nuevoJuego = gameController.iniciarEstadoJuego();
    nuevoJuego.jugadores = jugadoresRef;
    nuevoJuego.usernames = usernamesRef;
    
    juegos.set(roomId, nuevoJuego);
    io.to(roomId).emit('actualizarJuego', nuevoJuego);
  });

  socket.on('disconnect', () => {
    console.log(`Jugador desconectado: ${socket.id}`);
    
    juegos.forEach((juego, roomId) => {
      if (juego.jugadores.X === socket.id || juego.jugadores.O === socket.id) {
        console.log(`Jugador de sala ${roomId} desconectado. Esperando reconexión...`);
        
        if (timeoutsEliminacion.has(roomId)) clearTimeout(timeoutsEliminacion.get(roomId));
        
        if (timeoutsEliminacion.has(roomId)) clearTimeout(timeoutsEliminacion.get(roomId));

        const timer = setTimeout(() => {
            if (juegos.has(roomId)) {
                io.to(roomId).emit('jugadorDesconectado', 'El oponente se ha desconectado. El juego ha terminado');
                juegos.delete(roomId);
                timeoutsEliminacion.delete(roomId);
                console.log(`Sala ${roomId} eliminada por inactividad/desconexión`);
            }
        }, 30000); 

        timeoutsEliminacion.set(roomId, timer);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});