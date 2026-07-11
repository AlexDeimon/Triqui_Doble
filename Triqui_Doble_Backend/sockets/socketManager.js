import { obtenerSalasDisponibles } from '../services/roomService.js';
import { handleRoomEvents } from './roomEvents.js';
import { handleGameEvents } from './gameEvents.js';
import { handleDisconnectEvents } from './disconnectEvents.js';
import { handleFriendsEvents, handleUserDisconnect } from './friendsEvents.js';

export const initializeSockets = (io) => {
  io.on('connection', (socket) => {
    console.log(`Jugador conectado: ${socket.id}`);
    socket.emit('syncTime', Date.now());
    
    socket.on('pingTime', (clientSentAt) => {
      socket.emit('pongTime', { clientSentAt, serverTime: Date.now() });
    });
    
    obtenerSalasDisponibles().then(salas => {
      socket.emit('salasDisponibles', salas);
    });

    handleRoomEvents(io, socket);
    handleGameEvents(io, socket);
    handleDisconnectEvents(io, socket);
    handleFriendsEvents(io, socket);

    socket.on('disconnect', async () => {
      await handleUserDisconnect(io, socket);
    });
  });
};
