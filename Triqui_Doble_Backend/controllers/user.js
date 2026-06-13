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

export const buscarUsuarios = async (req, res) => {
  const { query, requester } = req.params;
  const user = await Usuario.findOne({ username: requester });
  const amigosUsernames = user ? user.amigos.map(a => a.username) : [];

  const users = await Usuario.find({ 
    $and: [
      { username: { $regex: query, $options: 'i' } },
      { username: { $nin: [requester, ...amigosUsernames] } }
    ]
  }).limit(10).select('username');
  res.json(users);
};

export const enviarSolicitudAmistad = async (req, res) => {
  const { usernameOrigen, usernameDestino } = req.body;
  if (usernameOrigen === usernameDestino) return res.status(400).json({ msg: 'No puedes agregarte a ti mismo' });

  const origen = await Usuario.findOne({ username: usernameOrigen });
  const destino = await Usuario.findOne({ username: usernameDestino });

  if (!destino) return res.status(404).json({ msg: 'Usuario no encontrado' });

  const yaSolicitado = origen.amigos.find(a => a.username === usernameDestino);
  if (yaSolicitado) return res.status(400).json({ msg: 'Ya hay una relación pendiente o existente' });

  origen.amigos.push({ usuario: destino._id, username: usernameDestino, estado: 'solicitado' });
  destino.amigos.push({ usuario: origen._id, username: usernameOrigen, estado: 'pendiente' });

  await origen.save();
  await destino.save();

  res.json({ msg: 'Solicitud enviada' });
};

export const aceptarSolicitudAmistad = async (req, res) => {
  const { usernameAcepta, usernameAmigo } = req.body;

  const acepta = await Usuario.findOne({ username: usernameAcepta });
  const amigo = await Usuario.findOne({ username: usernameAmigo });

  const relAcepta = acepta.amigos.find(a => a.username === usernameAmigo);
  const relAmigo = amigo.amigos.find(a => a.username === usernameAcepta);

  if (relAcepta) relAcepta.estado = 'aceptado';
  if (relAmigo) relAmigo.estado = 'aceptado';

  await acepta.save();
  await amigo.save();

  res.json({ msg: 'Solicitud aceptada' });
};

export const rechazarSolicitudAmistad = async (req, res) => {
  const { usernameRechaza, usernameAmigo } = req.body;
  
  await Usuario.updateOne({ username: usernameRechaza }, { $pull: { amigos: { username: usernameAmigo } } });
  await Usuario.updateOne({ username: usernameAmigo }, { $pull: { amigos: { username: usernameRechaza } } });

  res.json({ msg: 'Solicitud rechazada' });
};

export const eliminarAmigo = async (req, res) => {
  const { usernameSolicita, usernameAmigo } = req.body;
  
  await Usuario.updateOne({ username: usernameSolicita }, { $pull: { amigos: { username: usernameAmigo } } });
  await Usuario.updateOne({ username: usernameAmigo }, { $pull: { amigos: { username: usernameSolicita } } });

  res.json({ msg: 'Amigo eliminado' });
};

export const obtenerAmigos = async (req, res) => {
  const { username } = req.params;
  const user = await Usuario.findOne({ username });
  if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });
  res.json(user.amigos || []);
};

export const obtenerPerfil = async (req, res) => {
  const { username } = req.params;
  const user = await Usuario.findOne({ username });
  if (!user) return res.status(404).json({ msg: 'Usuario no encontrado' });

  const allUsers = await Usuario.find().sort({ 'estadisticas.puntaje': -1 });
  const rank = allUsers.findIndex(u => u.username === username) + 1;

  const regex = new RegExp(`(^|,)${username}(,|$)`);
  const historial = await Partidas.find({
    $or: [{ jugadorX: regex }, { jugadorO: regex }]
  });

  const opponents = {};
  historial.forEach(p => {
    let opponent;
    if (p.jugadorX.includes(username)) {
      opponent = p.jugadorO;
    } else {
      opponent = p.jugadorX;
    }

    const ops = opponent.split(',');
    ops.forEach(op => {
      if (op && op !== username) {
        opponents[op] = (opponents[op] || 0) + 1;
      }
    });
  });

  let rival = 'Ninguno';
  let maxGames = 0;
  for (const [op, games] of Object.entries(opponents)) {
    if (games > maxGames) {
      maxGames = games;
      rival = op;
    }
  }

  const { partidasGanadas, partidasPerdidas, partidasEmpatadas } = user.estadisticas;
  const total = partidasGanadas + partidasPerdidas + partidasEmpatadas;
  const porcentajes = {
    ganadas: total ? Math.round((partidasGanadas / total) * 100) : 0,
    perdidas: total ? Math.round((partidasPerdidas / total) * 100) : 0,
    empatadas: total ? Math.round((partidasEmpatadas / total) * 100) : 0
  };

  res.json({
    username: user.username,
    profileImage: user.profileImage,
    fechaRegistro: user._id.getTimestamp().toString(),
    rank,
    porcentajes,
    rival,
    totalPartidas: total
  });
};

export const actualizarPerfil = async (req, res) => {
  const { username, profileImage } = req.body;
  await Usuario.findOneAndUpdate({ username }, { profileImage });
  res.json({ msg: 'Perfil actualizado' });
};
