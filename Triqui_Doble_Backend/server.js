import 'dotenv/config';
import express from 'express';
import http from 'http';
import { Server } from "socket.io";
import cors from 'cors';
import { Partidas } from './models/game.js';
import { Usuario } from './models/user.js';
import { connectDB } from './config/db.js';

connectDB();

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const juegos = new Map();

const iniciarEstadoJuego = () => {
  return {
    tableros: Array.from({ length: 9 }, (_, i) => ({
      id: i,
      ganador: null,
      celdas: Array.from({ length: 9 }, (_, j) => ({ id: j, valor: null }))
    })),
    turnoActual: 'X',
    tableroActivo: null,
    ganador: null,
    jugadores: { X: null, O: null }
  };
}

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

app.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await Usuario.findOne({ username });
    if (user) return res.status(400).json({ msg:'El usuario ya existe'});

    user = new Usuario({ username, password });
    await user.save();
    res.json({ msg:'Usuario creado', userId: user._id});
  } catch (error) {
    res.status(500).send('Error en servidor');
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Usuario.findOne({ username });
    if (!user) return res.status(400).json({ msg:'Usuario no encontrado'});
    
    if (user.password !== password) {
      return res.status(400).json({ msg:'Contraseña incorrecta'});
    }

    res.json({ msg:'Login exitoso', username: user.username});
  } catch (error) {
    res.status(500).send('Error');
  }
});

io.on('connection', (socket) => {
  console.log(`Jugador conectado: ${socket.id}`);

  socket.on('crearSala', (roomId) => {
    if (juegos.has(roomId)) {
      socket.emit('error', 'La sala ya existe');
      return;
    }

    const estadojuego = iniciarEstadoJuego();
    estadojuego.jugadores.X = socket.id;
    juegos.set(roomId, estadojuego);
    socket.join(roomId);
    console.log(`Jugador ${socket.id} se unio a la sala ${roomId}`);
    socket.emit('salaCreada', {roomId, jugador: 'X'});
    io.to(roomId).emit('actualizarJuego', estadojuego);
  })

  socket.on('unirseASala', (roomId) => {
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
    socket.join(roomId);
    console.log(`Jugador ${socket.id} se unio a la sala ${roomId}`);
    socket.emit('salaUnida', {roomId, jugador: 'O'});
    io.to(roomId).emit('actualizarJuego', juego);
  })

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

    const ganadorGeneral = verificarGanador(juego.tableros, 'ganador');
    if (ganadorGeneral) {
      juego.ganador = ganadorGeneral;
      console.log(`Juego ganado por ${ganadorGeneral}`);
      try {
        const partida = new Partidas({
          ganador: ganadorGeneral,
          cantidadTurnos: juego.cantidadTurnos
        });
        await partida.save();
        console.log('Partida guardada');
      } catch (error) {
        console.error('Error al guardar la partida:', error);
      }
    } else {
        const todosTablerosTerminados = juego.tableros.every(t => t.ganador !== null);
        if (todosTablerosTerminados) {
            juego.ganador = 'E';
            console.log("Juego terminado en empate global");
        }
    }
    
    const nextTablero = juego.tableros[celdaId];
    const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

    if (nextTablero.ganador) {
        juego.tableroActivo = null;
    } else {
        juego.tableroActivo = celdaId;
    }

    juego.turnoActual = juego.turnoActual === 'X' ? 'O' : 'X';
    io.to(roomId).emit('actualizarJuego', estadojuego);
  });

  socket.on('disconnect', () => {
    console.log(`Jugador desconectado: ${socket.id}`);
    juegos.forEach((juego, roomId) => {
      if (juego.jugadores.X === socket.id || juego.jugadores.O === socket.id) {
        juegos.delete(roomId);
        console.log(`Sala ${roomId} eliminada`);
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});