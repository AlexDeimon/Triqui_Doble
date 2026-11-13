import { redisClient } from '../config/db.js';
import { socketWrapper } from '../utils/socketWrapper.js';
import { turnTimeouts, emitirSalasDisponibles } from '../services/roomService.js';

export const procesarDesconexionSala = async (io, socket, roomId) => {
  const juegoJson = await redisClient.get(`juego:${roomId}`);
  if (!juegoJson) return;

  const juego = JSON.parse(juegoJson);
  const rol = juego.jugadores ? Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socket.id) : null;

  if (!rol) {
    if (juego.espectadores && juego.espectadores.some(e => e.socketId === socket.id)) {
      console.log(`Espectador de sala ${roomId} desconectado.`);
    }
    return;
  }

  console.log(`Jugador de sala ${roomId} desconectado. Esperando reconexión...`);

  if (juego.ganador) {
    if (turnTimeouts.has(roomId)) {
      clearTimeout(turnTimeouts.get(roomId));
      turnTimeouts.delete(roomId);
    }
    await redisClient.del(`juego:${roomId}`);
    console.log(`Sala terminada ${roomId} eliminada por desconexión de un jugador.`);
    socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
    await emitirSalasDisponibles(io);
    return;
  }

  const compa = juego.ordenTurnos.find(r => r !== rol && r.charAt(0) === rol.charAt(0) && juego.jugadores[r]);
  const usr = juego.usernames[rol];
  const estabaJugando = juego.estado === 'jugando';

  if (juego.estado === 'esperando' || juego.estado === 'seleccionando_skin') {
    juego.usernames[rol] = null;
    juego.jugadoresListos[rol] = false;
    juego.estado = 'esperando';
    io.to(roomId).emit('toast', `${usr || rol} se desconectó`);
  } else if (juego.configuracion?.dosVsDos && compa) {
    io.to(roomId).emit('toast', `${usr || rol} se desconectó, ${rol.charAt(0)} queda en manos de ${juego.usernames[compa]}, ¡suerte!`);
  }

  juego.jugadores[rol] = null;

  if (!compa) {
    if (estabaJugando) {
      socket.to(roomId).emit('oponenteDesconectado', 'El oponente se ha desconectado. Esperando reconexión...');
    }
    if (turnTimeouts.has(roomId)) {
      clearTimeout(turnTimeouts.get(roomId));
      turnTimeouts.delete(roomId);
      juego.ultimaActualizacionTurno = null;
    }
  }

  if (juego.estado === 'esperando') {
    const hayJugadoresConectados = Object.values(juego.jugadores).some(id => id !== null && id !== 'BOT');
    if (!hayJugadoresConectados) {
      await redisClient.del(`juego:${roomId}`);
      console.log(`Sala ${roomId} eliminada por desconexión sin jugadores restantes.`);
      await emitirSalasDisponibles(io);
      return;
    }
  }

  await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
  io.to(roomId).emit('actualizarJuego', juego);

  if (juego.estado === 'esperando') {
    await emitirSalasDisponibles(io);
  }
};

export const handleDisconnectEvents = (io, socket) => {
  socket.on('disconnecting', socketWrapper(socket, async () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id || roomId.startsWith('user:')) continue;
      await procesarDesconexionSala(io, socket, roomId);
    }
  }));
};
