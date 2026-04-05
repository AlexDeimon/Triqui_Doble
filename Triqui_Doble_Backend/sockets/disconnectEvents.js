import { redisClient } from '../config/db.js';
import { socketWrapper } from '../utils/socketWrapper.js';
import { GameRole } from '../utils/constants.js';
import {
  turnTimeouts,
  emitirSalasDisponibles
} from '../services/roomService.js';

export const handleDisconnectEvents = (io, socket) => {
  socket.on('disconnecting', socketWrapper(socket, async () => {
    const rooms = socket.rooms;
    for (const roomId of rooms) {
      if (roomId === socket.id) continue;

      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (juegoJson) {
        const juego = JSON.parse(juegoJson);
        let rol = Object.keys(juego.jugadores).find(k => juego.jugadores[k] === socket.id);
        if (rol) {
          console.log(`Jugador de sala ${roomId} desconectado. Esperando reconexión...`);

          const compa = juego.ordenTurnos.find(r => r !== rol && r.charAt(0) === rol.charAt(0) && juego.jugadores[r]);
          if (!compa && juego.estado !== 'esperando') {
            socket.to(roomId).emit('oponenteDesconectado', 'El oponente se ha desconectado. Esperando reconexión...');
          }

          const usr = juego.usernames[rol];
          if (juego.estado === 'esperando') {
            juego.usernames[rol] = null;
            io.to(roomId).emit('toast', `${usr || rol} se desconectó`);
          } else if (juego.configuracion?.dosVsDos && compa) {
            io.to(roomId).emit('toast', `${usr || rol} se desconectó, ${rol.charAt(0)} queda en manos de ${juego.usernames[compa]}, ¡suerte!`);
          }
          juego.jugadores[rol] = null;

          if (juego.ganador) {
            await redisClient.del(`juego:${roomId}`);
            console.log(`Sala terminada ${roomId} eliminada por desconexión de un jugador.`);
            socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
            await emitirSalasDisponibles(io);
            continue;
          }

          if (!compa) {
            if (turnTimeouts.has(roomId)) {
              clearTimeout(turnTimeouts.get(roomId));
              turnTimeouts.delete(roomId);
              juego.ultimaActualizacionTurno = null;
              await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
              io.to(roomId).emit('actualizarJuego', juego);
            }
          } else {
            await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
            io.to(roomId).emit('actualizarJuego', juego);
          }
        } else if (
          juego.espectadores &&
          juego.espectadores.some((e) => e.socketId === socket.id)
        ) {
          console.log(`Espectador de sala ${roomId} desconectado.`);
        }
      }
    }
  }));
};
