import { redisClient } from '../config/db.js';
import {
  timeoutsEliminacion,
  turnTimeouts,
  emitirSalasDisponibles
} from '../services/roomService.js';

export const handleDisconnectEvents = (io, socket) => {
  socket.on('disconnecting', async () => {
    const rooms = socket.rooms;
    for (const roomId of rooms) {
      if (roomId === socket.id) continue;

      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (juegoJson) {
        const juego = JSON.parse(juegoJson);
        if (juego.jugadores.X === socket.id || juego.jugadores.O === socket.id) {
          console.log(`Jugador de sala ${roomId} desconectado. Esperando reconexión...`);

          socket.to(roomId).emit('oponenteDesconectado', 'El oponente se ha desconectado. Esperando reconexión...');

          const rol = juego.jugadores.X === socket.id ? 'X' : 'O';
          juego.jugadores[rol] = null;

          if (juego.ganador) {
            await redisClient.del(`juego:${roomId}`);
            console.log(`Sala terminada ${roomId} eliminada por desconexión de un jugador.`);
            socket.to(roomId).emit('jugadorDesconectado', 'El oponente ha abandonado la sala.');
            await emitirSalasDisponibles(io);
            continue;
          }

          if (turnTimeouts.has(roomId)) {
            clearTimeout(turnTimeouts.get(roomId));
            turnTimeouts.delete(roomId);
            juego.ultimaActualizacionTurno = null;
            await redisClient.set(`juego:${roomId}`, JSON.stringify(juego));
            io.to(roomId).emit('actualizarJuego', juego);
          }

          if (timeoutsEliminacion.has(roomId)) clearTimeout(timeoutsEliminacion.get(roomId));

          const timer = setTimeout(async () => {
            const currentJuegoJson = await redisClient.get(`juego:${roomId}`);
            if (currentJuegoJson) {
              const currentJuego = JSON.parse(currentJuegoJson);
              const currentSocketId = currentJuego.jugadores[rol];

              if (currentSocketId && currentSocketId !== socket.id) {
                console.log(`Sala ${roomId}: El jugador ${rol} se reconectó (Socket actualizado), cancelando eliminación.`);
                timeoutsEliminacion.delete(roomId);
                return;
              }

              io.to(roomId).emit('jugadorDesconectado', 'La sala se eliminó por inactividad');
              await redisClient.del(`juego:${roomId}`);
              timeoutsEliminacion.delete(roomId);
              console.log(`Sala ${roomId} eliminada por inactividad/desconexión`);
              await emitirSalasDisponibles(io);
            }
          }, 60000);

          timeoutsEliminacion.set(roomId, timer);
        } else if (
          juego.espectadores &&
          juego.espectadores.some((e) => e.socketId === socket.id)
        ) {
          console.log(`Espectador de sala ${roomId} desconectado.`);
        }
      }
    }
  });
};
