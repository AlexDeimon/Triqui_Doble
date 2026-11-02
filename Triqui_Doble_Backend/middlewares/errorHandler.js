export const errorHandler = (err, req, res, next) => {
  console.error('[Error global Express]:', err);
  res.status(500).json({ error: true, msg: 'Error interno del servidor' });
};
