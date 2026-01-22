import { Usuario } from '../models/user.js';

export const registrar = async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await Usuario.findOne({ username });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    user = new Usuario({ username, password });
    await user.save();
    res.json({ msg: 'Usuario creado', userId: user._id });
  } catch (error) {
    res.status(500).send('Error en servidor');
  }
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await Usuario.findOne({ username });
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });

    if (user.password !== password) {
      return res.status(400).json({ msg: 'Contraseña incorrecta' });
    }

    res.json({ msg: 'Login exitoso', username: user.username });
  } catch (error) {
    res.status(500).send('Error');
  }
};

export const actualizarEstadisticas = async (username, resultado) => {
  try {
    const update = {};
    if (resultado === 'G') update['estadisticas.partidasGanadas'] = 1;
    if (resultado === 'P') update['estadisticas.partidasPerdidas'] = 1;
    if (resultado === 'E') update['estadisticas.partidasEmpatadas'] = 1;

    await Usuario.findOneAndUpdate(
      { username },
      { $inc: update }
    );
  } catch (error) {
    console.error(`Error actualizando estadísticas de ${username}:`, error);
  }
};
