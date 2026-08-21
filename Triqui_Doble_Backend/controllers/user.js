import { Usuario } from '../models/user.js';
import { Partidas } from '../models/game.js';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const registroSchema = z.object({
  username: z.string({
    required_error: "El nombre de usuario es requerido",
    invalid_type_error: "El nombre de usuario no es valido"
  })
    .min(3, "El usuario debe tener al menos 3 caracteres")
    .max(10, "El usuario no debe superar los 10 caracteres")
    .regex(/^[a-zA-Z0-9_]+$/, "El usuario solo puede contener letras, números y guion bajo")
    .trim(),
  password: z.string({
    required_error: "La contraseña es requerida",
    invalid_type_error: "La contraseña no es valida"
  })
    .min(6, "La contraseña debe tener al menos 6 caracteres")
    .max(30, "La contraseña no debe superar los 30 caracteres")
});

export const registrar = async (req, res) => {
  const parseResult = registroSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ msg: parseResult.error.errors[0].message });
  }

  const { username, password } = parseResult.data;
  let user = await Usuario.findOne({ username });
  if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  user = new Usuario({ username, password: hashedPassword });
  await user.save();
  res.json({ msg: 'Usuario creado', userId: user._id });
};

export const login = async (req, res) => {
  const { username, password } = req.body;
  const user = await Usuario.findOne({ username });
  if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(400).json({ msg: 'Contraseña incorrecta' });
  }

  res.json({ msg: 'Login exitoso', username: user.username });
};

export const actualizarEstadisticas = async (username, resultado, puntaje) => {
  const user = await Usuario.findOne({ username });
  if (!user) return;

  if (resultado === 'G') {
    user.estadisticas.partidasGanadas = (user.estadisticas.partidasGanadas || 0) + 1;
    user.estadisticas.rachaActual = (user.estadisticas.rachaActual || 0) + 1;
    if (user.estadisticas.rachaActual > (user.estadisticas.recordRacha || 0)) {
      user.estadisticas.recordRacha = user.estadisticas.rachaActual;
    }
  } else if (resultado === 'P') {
    user.estadisticas.partidasPerdidas = (user.estadisticas.partidasPerdidas || 0) + 1;
    user.estadisticas.rachaActual = 0;
  } else if (resultado === 'E') {
    user.estadisticas.partidasEmpatadas = (user.estadisticas.partidasEmpatadas || 0) + 1;
  }

  if (puntaje > 0) {
    user.estadisticas.puntaje = (user.estadisticas.puntaje || 0) + puntaje;
  }

  await user.save();
};

export const ranking = async (req, res) => {
  let users = await Usuario.find().sort({ 'estadisticas.puntaje': -1 });
  users = users.filter(user => user.estadisticas.puntaje !== 0);
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

  let allUsers = await Usuario.find().sort({ 'estadisticas.puntaje': -1 });
  allUsers = allUsers.filter(user => user.estadisticas.puntaje !== 0);
  let rank = 'Sin clasificar';
  if (allUsers.findIndex(u => u.username === username) != -1)
    rank = allUsers.findIndex(u => u.username === username) + 1;

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

  const { partidasGanadas, partidasPerdidas, partidasEmpatadas, rachaActual = 0, recordRacha = 0 } = user.estadisticas;
  const total = partidasGanadas + partidasPerdidas + partidasEmpatadas;
  const porcentajes = {
    ganadas: total ? Math.round((partidasGanadas / total) * 100) : 0,
    perdidas: total ? Math.round((partidasPerdidas / total) * 100) : 0,
    empatadas: total ? Math.round((partidasEmpatadas / total) * 100) : 0
  };

  let puntos = user.estadisticas.puntaje;

  res.json({
    username: user.username,
    profileImage: user.profileImage,
    fechaRegistro: user._id.getTimestamp().toString(),
    rank,
    porcentajes,
    rival,
    totalPartidas: total,
    puntaje: puntos,
    rachaActual,
    recordRacha
  });
};

export const actualizarPerfil = async (req, res) => {
  const { username, profileImage } = req.body;
  await Usuario.findOneAndUpdate({ username }, { profileImage });
  res.json({ msg: 'Perfil actualizado' });
};

export const obtenerReplay = async (req, res) => {
  const { partidaId } = req.params;
  const partida = await Partidas.findById(partidaId);
  if (!partida) return res.status(404).json({ msg: 'Partida no encontrada' });
  if (!partida.movimientos || partida.movimientos.length === 0) {
    return res.status(404).json({ msg: 'Esta partida no tiene datos de replay' });
  }
  res.json(partida);
};
