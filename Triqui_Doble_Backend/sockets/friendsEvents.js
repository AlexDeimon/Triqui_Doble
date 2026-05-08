import { Usuario } from '../models/user.js';
import { socketWrapper } from '../utils/socketWrapper.js';

export const onlineUsers = new Map();

export const handleFriendsEvents = (io, socket) => {
  socket.on('identificar', async (username) => {
    if (username) {
      socket.data.username = username;
      socket.join(`user:${username}`);
      
      if (!onlineUsers.has(username)) {
        onlineUsers.set(username, new Set());
        console.log(`Usuario online: ${username}`);
        notifyFriendStatus(io, username, true);
      }
      onlineUsers.get(username).add(socket.id);

      try {
        const user = await Usuario.findOne({ username });
        if (user && user.amigos) {
          const isFirstSocket = onlineUsers.get(username).size === 1;
          
          user.amigos.forEach(friend => {
            if (friend.estado === 'pendiente' && isFirstSocket) {
              socket.emit('nuevaSolicitud', { from: friend.username });
            }
            
            if (friend.estado === 'aceptado' && onlineUsers.has(friend.username)) {
              socket.emit('amigoStatus', {
                username: friend.username,
                isOnline: true
              });
            }
          });
        }
      } catch (error) {
        console.error('Error enviando estados iniciales de amigos:', error);
      }
    }
  });

  socket.on('invitarAmigo', socketWrapper(socket, async ({ friendUsername, roomId }) => {
    if (onlineUsers.has(friendUsername)) {
      io.to(`user:${friendUsername}`).emit('invitacionRecibida', {
        from: socket.data.username,
        roomId: roomId
      });
    }
  }));

  socket.on('enviarSolicitudRealtime', ({ toUsername }) => {
    if (onlineUsers.has(toUsername)) {
      io.to(`user:${toUsername}`).emit('nuevaSolicitud', { from: socket.data.username });
    }
  });

  socket.on('aceptarSolicitudRealtime', ({ toUsername }) => {
    if (onlineUsers.has(toUsername)) {
      io.to(`user:${toUsername}`).emit('solicitudAceptada', { from: socket.data.username });
      
      io.to(`user:${toUsername}`).emit('amigoStatus', {
        username: socket.data.username,
        isOnline: true
      });
      socket.emit('amigoStatus', {
        username: toUsername,
        isOnline: true
      });
    }
  });

  socket.on('logout', async () => {
    await handleUserDisconnect(io, socket);
    socket.data.username = null;
  });
};

export const handleUserDisconnect = async (io, socket) => {
  const username = socket.data.username;
  if (username && onlineUsers.has(username)) {
    const sockets = onlineUsers.get(username);
    sockets.delete(socket.id);
    
    if (sockets.size === 0) {
      onlineUsers.delete(username);
      console.log(`Usuario offline: ${username}`);
      await notifyFriendStatus(io, username, false);
    }
  }
};

const notifyFriendStatus = async (io, username, isOnline) => {
  try {
    const user = await Usuario.findOne({ username });
    if (user && user.amigos) {
      user.amigos.forEach(friend => {
        if (friend.estado === 'aceptado') {
          if (onlineUsers.has(friend.username)) {
            io.to(`user:${friend.username}`).emit('amigoStatus', {
              username: username,
              isOnline: isOnline
            });
          }
        }
      });
    }
  } catch (error) {
    console.error('Error notificando status de amigo:', error);
  }
};
