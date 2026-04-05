import { Usuario } from '../models/user.js';
import { Partidas } from '../models/game.js';

export const registrar = async (req, res) => {
  const { username, password } = req.body;
  let user = await Usuario.findOne({ username });
  if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

  user = new Usuario({ username, password });
  await user.save();
  res.json({ msg: 'Usuario creado', userId: user._id });
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  const user = await Usuario.findOne({ username });
  if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });

  if (user.password !== password) {
    return res.status(400).json({ msg: 'Contraseña incorrecta' });
  }

  res.json({ msg: 'Login exitoso', username: user.username });
};

export const actualizarEstadisticas = async (username, resultado, puntaje) => {
  const update = {};
  if (resultado === 'G') update['estadisticas.partidasGanadas'] = 1;
  if (resultado === 'P') update['estadisticas.partidasPerdidas'] = 1;
  if (resultado === 'E') update['estadisticas.partidasEmpatadas'] = 1;

  if (puntaje > 0) {
    update['estadisticas.puntaje'] = puntaje;
  }

  await Usuario.findOneAndUpdate(
    { username },
    { $inc: update }
  );
};

export const ranking = async (req, res) => {
  const users = await Usuario.find().sort({ 'estadisticas.puntaje': -1 });
  res.json(users);
};

export const historialJugador = async (req, res) => {
  const { username } = req.params;
  const regex = new RegExp(`(^|,)${username}(,|$)`);
  const historial = await Partidas.find({
    $or: [{ jugadorX: regex }, { jugadorO: regex }]
  }).sort({ fecha: -1 });
  res.json(historial);
};
