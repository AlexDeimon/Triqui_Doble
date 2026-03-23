export const errorHandler = (err, req, res, next) => {
  console.error('[Error global Express]:', err.message);
  res.status(500).json({ error: true, msg: 'Error interno del servidor', details: err.message });
};
