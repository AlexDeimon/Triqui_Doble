import { obtenerSalasDisponibles } from '../services/roomService.js';
import { handleRoomEvents } from './roomEvents.js';
import { handleGameEvents } from './gameEvents.js';
import { handleDisconnectEvents } from './disconnectEvents.js';

export const initializeSockets = (io) => {
  io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);
    socket.emit('syncTime', Date.now());
    obtenerSalasDisponibles().then(salas => {
      socket.emit('salasDisponibles', salas);
    });

    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);
    handleDisconnectEvents(io, socket);
  });
};
