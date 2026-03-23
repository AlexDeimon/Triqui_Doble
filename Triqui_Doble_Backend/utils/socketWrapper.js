export const socketWrapper = (socket, fn) => async (...args) => {
  try {
    await fn(...args);
  } catch (error) {
    console.error(`[Socket Error - ID ${socket.id}]:`, error.message);
    socket.emit('error_servidor', 'Ocurrió un error inesperado en el servidor.');
  }
};
