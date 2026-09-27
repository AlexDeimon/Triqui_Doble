import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { turnTimeouts, resetearTimeoutInactividad, iniciarTimeoutTurno, emitirSalasDisponibles } from './roomService.js';

const PESOS_TABLEROS = [3, 2, 3, 2, 4, 2, 3, 2, 3]; // Centro (4) vale 4, Esquinas valen 3, Bordes valen 2

export const obtenerCeldaGanadora = (tablero, rol) => {
  for (const patron of gameController.patronesGanadores) {
    const [a, b, c] = patron;
    const celdas = [tablero.celdas[a], tablero.celdas[b], tablero.celdas[c]];
    const countRol = celdas.filter(c => c.valor === rol).length;
    const countVacias = celdas.filter(c => c.valor === null).length;
    
    if (countRol === 2 && countVacias === 1) {
      return celdas.find(c => c.valor === null).id;
    }
  }
  return null;
};

// =========================================================================
// MOTOR MINIMAX CON PODA ALFA-BETA PARA DIFICULTAD EXPERTO
// =========================================================================

// Clonación ultra-rápida de los tableros sin overhead de JSON
const clonarTableros = (tableros) => {
  return tableros.map(t => ({
    id: t.id,
    ganador: t.ganador,
    celdas: t.celdas.map(c => ({ id: c.id, valor: c.valor }))
  }));
};

// Aplica un movimiento en la simulación y retorna el nuevo estado ligero
const aplicarMovimientoSimulado = (tableros, tableroActivo, tableroId, celdaId, rol, configuracion) => {
  const nuevosTableros = tableros.map(t => {
    if (t.id !== tableroId) return t;

    const nuevasCeldas = t.celdas.map(c => c.id === celdaId ? { ...c, valor: rol } : c);
    let nuevoGanador = t.ganador;

    if (configuracion?.robarTableros || !nuevoGanador) {
      const marcoLinea = gameController.patronesGanadores
        .filter(patron => patron.includes(celdaId))
        .some(patron => patron.every(idx => nuevasCeldas[idx].valor === rol));

      if (marcoLinea && nuevoGanador !== rol) {
        nuevoGanador = rol;
      } else if (!nuevoGanador && nuevasCeldas.every(c => c.valor !== null)) {
        nuevoGanador = 'EMPATE';
      }
    }

    return {
      id: t.id,
      ganador: nuevoGanador,
      celdas: nuevasCeldas
    };
  });

  // Verificar ganador global
  let ganadorGlobal = null;
  if (configuracion?.objetivo === 'mayoria') {
    const victX = nuevosTableros.filter(t => t.ganador === 'X').length;
    const victO = nuevosTableros.filter(t => t.ganador === 'O').length;
    if (victX >= 5) ganadorGlobal = 'X';
    else if (victO >= 5) ganadorGlobal = 'O';
    else if (nuevosTableros.every(t => t.ganador !== null)) {
      if (victX > victO) ganadorGlobal = 'X';
      else if (victO > victX) ganadorGlobal = 'O';
      else ganadorGlobal = 'EMPATE';
    }
  } else {
    const patron = configuracion?.patronGanador || 'Cualquiera';
    ganadorGlobal = gameController.verificarGanador(nuevosTableros, 'ganador', patron);
    if (!ganadorGlobal && nuevosTableros.every(t => t.ganador !== null)) {
      ganadorGlobal = 'EMPATE';
    }
  }

  // Calcular siguiente tablero activo siguiendo la regla del juego
  let siguienteTableroActivo = null;
  if (configuracion?.modoSeleccion === 'Aleatorio') {
    siguienteTableroActivo = null;
  } else {
    const nextTablero = nuevosTableros[celdaId];
    const isNextFull = nextTablero.celdas.every(c => c.valor !== null);

    if (isNextFull) {
      siguienteTableroActivo = null; // Tiro libre cuando el siguiente tablero está lleno
    } else {
      siguienteTableroActivo = celdaId;
    }
  }

  return {
    tableros: nuevosTableros,
    tableroActivo: siguienteTableroActivo,
    ganadorGlobal
  };
};

// Obtener movimientos legales válidos para la simulación
const obtenerMovimientosValidosSim = (tableros, tableroActivo, configuracion) => {
  const movimientos = [];
  if (tableroActivo !== null && tableros[tableroActivo]) {
    const t = tableros[tableroActivo];
    const estaLleno = t.celdas.every(c => c.valor !== null);

    if (!estaLleno) {
      for (const c of t.celdas) {
        if (c.valor === null) {
          movimientos.push({ tableroId: t.id, celdaId: c.id });
        }
      }
      return movimientos;
    }
  }

  for (const t of tableros) {
    const estaLleno = t.celdas.every(c => c.valor !== null);
    if (!estaLleno) {
      for (const c of t.celdas) {
        if (c.valor === null) {
          movimientos.push({ tableroId: t.id, celdaId: c.id });
        }
      }
    }
  }
  return movimientos;
};

// Función de Evaluación Heurística Multi-Modo
const evaluarEstado = (tableros, tableroActivo, botRol, oponenteRol, configuracion) => {
  let score = 0;

  // 1. Objetivo: Mayoría de Triquis
  if (configuracion?.objetivo === 'mayoria') {
    let victBot = 0;
    let victOponente = 0;
    for (let i = 0; i < 9; i++) {
      if (tableros[i].ganador === botRol) victBot++;
      else if (tableros[i].ganador === oponenteRol) victOponente++;
    }

    score += (victBot - victOponente) * 1000;
    if (victBot >= 5) return 100000;
    if (victOponente >= 5) return -100000;
    if (victBot === 4) score += 2500;
    if (victOponente === 4) score -= 3500;
  } else {
    // 2. Objetivo: Triqui Doble Estándar o Patrón Específico
    const patron = configuracion?.patronGanador || 'Cualquiera';
    const lineasAEvaluar = (patron === 'Cualquiera' || !gameController.mapeoPatrones.hasOwnProperty(patron))
      ? gameController.patronesGanadores
      : [gameController.patronesGanadores[gameController.mapeoPatrones[patron]]];

    for (const [a, b, c] of lineasAEvaluar) {
      const gA = tableros[a].ganador;
      const gB = tableros[b].ganador;
      const gC = tableros[c].ganador;
      const ganadores = [gA, gB, gC];

      const countBot = ganadores.filter(g => g === botRol).length;
      const countOponente = ganadores.filter(g => g === oponenteRol).length;
      const countLibre = ganadores.filter(g => g === null).length;

      if (countBot === 3) return 100000;
      if (countOponente === 3) return -100000;

      if (countBot === 2 && countLibre === 1) score += 2000;
      if (countOponente === 2 && countLibre === 1) score -= 2500;
      if (countBot === 1 && countLibre === 2) score += 250;
      if (countOponente === 1 && countLibre === 2) score -= 250;
    }

    // Ponderación por control posicional de macro-tableros
    for (let i = 0; i < 9; i++) {
      if (tableros[i].ganador === botRol) {
        score += 400 * PESOS_TABLEROS[i];
      } else if (tableros[i].ganador === oponenteRol) {
        score -= 400 * PESOS_TABLEROS[i];
      }
    }
  }

  // 3. Evaluación Micro (Celdas y líneas dentro de cada subtablero)
  for (let i = 0; i < 9; i++) {
    const t = tableros[i];
    const estaLleno = t.celdas.every(c => c.valor !== null);
    if (estaLleno) continue;

    if (t.ganador !== null && !configuracion?.robarTableros) continue;

    for (const [a, b, c] of gameController.patronesGanadores) {
      const vA = t.celdas[a].valor;
      const vB = t.celdas[b].valor;
      const vC = t.celdas[c].valor;
      const vals = [vA, vB, vC];

      const cBot = vals.filter(v => v === botRol).length;
      const cOponente = vals.filter(v => v === oponenteRol).length;
      const cVacias = vals.filter(v => v === null).length;

      if (cBot === 2 && cVacias === 1) {
        score += (t.ganador === oponenteRol && configuracion?.robarTableros) ? 350 : 60;
      }
      if (cOponente === 2 && cVacias === 1) {
        score -= (t.ganador === botRol && configuracion?.robarTableros) ? 400 : 80;
      }
      if (cBot === 1 && cVacias === 2) score += 10;
      if (cOponente === 1 && cVacias === 2) score -= 10;
    }

    // Centro y esquinas locales
    if (t.celdas[4].valor === botRol) score += 15;
    else if (t.celdas[4].valor === oponenteRol) score -= 15;

    for (const corner of [0, 2, 6, 8]) {
      if (t.celdas[corner].valor === botRol) score += 6;
      else if (t.celdas[corner].valor === oponenteRol) score -= 6;
    }
  }

  // 4. Redirección y Control de Tablero Activo (solo si no es modo aleatorio)
  if (configuracion?.modoSeleccion !== 'Aleatorio') {
    if (tableroActivo === null) {
      score -= 200; // Penalización por regalar tiro libre al oponente
    } else if (tableros[tableroActivo]) {
      const nextTab = tableros[tableroActivo];
      const celdaGanadoraOponente = obtenerCeldaGanadora(nextTab, oponenteRol);
      if (celdaGanadoraOponente !== null) {
        score -= 450; // Penalización por enviar al oponente a un subtablero donde gana de inmediato
      }
    }
  }

  return score;
};

// Ordenamiento de jugadas para maximizar cortes en la Poda Alfa-Beta
const ordenarMovimientos = (movimientos, tableros, rolActivo, rolRival, configuracion) => {
  movimientos.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;

    const tabA = tableros.find(t => t.id === a.tableroId);
    const tabB = tableros.find(t => t.id === b.tableroId);

    if (tabA) {
      if (obtenerCeldaGanadora(tabA, rolActivo) === a.celdaId) scoreA += 500;
      if (obtenerCeldaGanadora(tabA, rolRival) === a.celdaId) scoreA += 300;
      if (a.celdaId === 4) scoreA += 50;
      else if ([0, 2, 6, 8].includes(a.celdaId)) scoreA += 20;
    }

    if (tabB) {
      if (obtenerCeldaGanadora(tabB, rolActivo) === b.celdaId) scoreB += 500;
      if (obtenerCeldaGanadora(tabB, rolRival) === b.celdaId) scoreB += 300;
      if (b.celdaId === 4) scoreB += 50;
      else if ([0, 2, 6, 8].includes(b.celdaId)) scoreB += 20;
    }

    return scoreB - scoreA;
  });
};

// Algoritmo Minimax con Poda Alfa-Beta y control estricto de presupuesto de nodos
const minimax = (tableros, tableroActivo, depth, isMaximizing, alpha, beta, botRol, oponenteRol, configuracion, tracker) => {
  if (tracker.nodes++ > 10000) {
    return evaluarEstado(tableros, tableroActivo, botRol, oponenteRol, configuracion);
  }

  const legalMoves = obtenerMovimientosValidosSim(tableros, tableroActivo, configuracion);

  if (depth <= 0 || legalMoves.length === 0) {
    return evaluarEstado(tableros, tableroActivo, botRol, oponenteRol, configuracion);
  }

  const currentRol = isMaximizing ? botRol : oponenteRol;

  if (isMaximizing) {
    let maxEval = -Infinity;
    ordenarMovimientos(legalMoves, tableros, botRol, oponenteRol, configuracion);

    for (const move of legalMoves) {
      const { tableros: nextTableros, tableroActivo: nextTableroActivo, ganadorGlobal } =
        aplicarMovimientoSimulado(tableros, tableroActivo, move.tableroId, move.celdaId, currentRol, configuracion);

      if (ganadorGlobal === botRol) {
        return 100000 + depth;
      }

      let evalScore;
      if (ganadorGlobal === oponenteRol) {
        evalScore = -100000 - depth;
      } else if (ganadorGlobal === 'EMPATE') {
        evalScore = 0;
      } else {
        const nextDepth = (nextTableroActivo === null || legalMoves.length > 20) ? depth - 2 : depth - 1;
        evalScore = minimax(nextTableros, nextTableroActivo, nextDepth, false, alpha, beta, botRol, oponenteRol, configuracion, tracker);
      }

      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Corte Alfa-Beta
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    ordenarMovimientos(legalMoves, tableros, oponenteRol, botRol, configuracion);

    for (const move of legalMoves) {
      const { tableros: nextTableros, tableroActivo: nextTableroActivo, ganadorGlobal } =
        aplicarMovimientoSimulado(tableros, tableroActivo, move.tableroId, move.celdaId, currentRol, configuracion);

      if (ganadorGlobal === oponenteRol) {
        return -100000 - depth;
      }

      let evalScore;
      if (ganadorGlobal === botRol) {
        evalScore = 100000 + depth;
      } else if (ganadorGlobal === 'EMPATE') {
        evalScore = 0;
      } else {
        const nextDepth = (nextTableroActivo === null || legalMoves.length > 20) ? depth - 2 : depth - 1;
        evalScore = minimax(nextTableros, nextTableroActivo, nextDepth, true, alpha, beta, botRol, oponenteRol, configuracion, tracker);
      }

      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Corte Alfa-Beta
    }
    return minEval;
  }
};

// Función principal para la Dificultad Experto
const obtenerMejorMovimientoExperto = (juego, botRol) => {
  const oponenteRol = botRol === 'X' ? 'O' : 'X';
  const configuracion = juego.configuracion || {};
  const tableros = clonarTableros(juego.tableros);
  const tableroActivo = juego.tableroActivo;

  const legalMoves = obtenerMovimientosValidosSim(tableros, tableroActivo, configuracion);
  if (legalMoves.length === 0) return null;
  if (legalMoves.length === 1) return legalMoves[0];

  // 1. FAST CHECK: Victoria inmediata en 1 movimiento
  for (const move of legalMoves) {
    const res = aplicarMovimientoSimulado(tableros, tableroActivo, move.tableroId, move.celdaId, botRol, configuracion);
    if (res.ganadorGlobal === botRol) {
      return move;
    }
  }

  // 2. Profundidad dinámica adaptativa según modo de juego
  let depth = 4;
  if (configuracion.modoSeleccion === 'Aleatorio') {
    depth = 2; // En modo aleatorio, el siguiente tablero es probabilístico (evita explosión 80^N)
  } else if (tableroActivo === null || legalMoves.length > 15) {
    depth = 3; // En tiro libre, profundidad 3 es instantánea y muy precisa
  }

  ordenarMovimientos(legalMoves, tableros, botRol, oponenteRol, configuracion);

  let bestMove = legalMoves[0];
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  const tracker = { nodes: 0 };

  for (const move of legalMoves) {
    const { tableros: nextTableros, tableroActivo: nextTableroActivo, ganadorGlobal } =
      aplicarMovimientoSimulado(tableros, tableroActivo, move.tableroId, move.celdaId, botRol, configuracion);

    let score;
    if (ganadorGlobal === botRol) {
      score = 100000;
    } else if (ganadorGlobal === oponenteRol) {
      score = -100000;
    } else if (ganadorGlobal === 'EMPATE') {
      score = 0;
    } else {
      const nextDepth = (nextTableroActivo === null || legalMoves.length > 20) ? depth - 2 : depth - 1;
      score = minimax(nextTableros, nextTableroActivo, nextDepth, false, alpha, beta, botRol, oponenteRol, configuracion, tracker);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
    alpha = Math.max(alpha, bestScore);
  }

  return bestMove;
};

// =========================================================================
// === ALGORITMO MONTE CARLO TREE SEARCH (MCTS) PARA DIFICULTAD DIFÍCIL ===
// =========================================================================

class MCTSNode {
  constructor(juego, parent = null, lastMove = null) {
    this.juego = juego;
    this.parent = parent;
    this.lastMove = lastMove;
    this.children = [];
    this.visits = 0;
    this.wins = 0;

    // Guardamos qué jugador realizó el movimiento que llevó a este nodo.
    // Esto es igual al jugador activo del turno anterior (el del nodo padre).
    if (parent) {
      const parentActiveRolLargo = parent.juego.ordenTurnos ? 
        parent.juego.ordenTurnos[parent.juego.indiceTurnoActual] : parent.juego.turnoActual;
      this.playerWhoMoved = parentActiveRolLargo.charAt(0);
    } else {
      this.playerWhoMoved = null;
    }
  }

  isTerminal() {
    return this.juego.ganador !== undefined && this.juego.ganador !== null;
  }

  getUCB1(c = 1.41) {
    if (this.visits === 0) return Infinity;
    return (this.wins / this.visits) + c * Math.sqrt(Math.log(this.parent.visits) / this.visits);
  }
}

// Obtiene todos los movimientos válidos posibles dado un estado del juego
const obtenerMovimientosLegales = (juego) => {
  if (juego.ganador || juego.estado !== 'jugando') return [];

  let tableroId = juego.tableroActivo !== null ? juego.tableros[juego.tableroActivo].id : null;
  
  if (tableroId === null) {
    const tablerosDisponibles = juego.tableros.filter(t => !t.celdas.every(c => c.valor !== null));
    
    const movimientos = [];
    for (const t of tablerosDisponibles) {
      const celdasVacias = t.celdas.filter(c => c.valor === null);
      for (const c of celdasVacias) {
        movimientos.push({ tableroId: t.id, celdaId: c.id });
      }
    }
    return movimientos;
  } else {
    const t = juego.tableros.find(tab => tab.id === tableroId);
    if (!t) return [];
    const celdasVacias = t.celdas.filter(c => c.valor === null);
    return celdasVacias.map(c => ({ tableroId: t.id, celdaId: c.id }));
  }
};

// Retropropaga los resultados de la simulación hacia la raíz
const backpropagate = (node, result) => {
  let tempNode = node;
  while (tempNode !== null) {
    tempNode.visits++;
    if (tempNode.parent) {
      if (result === 'empate') {
        tempNode.wins += 0.5;
      } else if (result === tempNode.playerWhoMoved) {
        tempNode.wins += 1;
      }
    }
    tempNode = tempNode.parent;
  }
};

const runMCTS = (juegoOriginal, timeLimitMs = 500) => {
  const rootJuego = JSON.parse(JSON.stringify(juegoOriginal));
  rootJuego.isSimulation = true;
  const root = new MCTSNode(rootJuego);

  const startTime = Date.now();
  let iterations = 0;

  while (Date.now() - startTime < timeLimitMs) {
    // 1. Selección: Viaja por el árbol usando UCB1
    let node = root;
    while (node.children.length > 0) {
      let bestChild = null;
      let bestUCB = -Infinity;
      for (const child of node.children) {
        const ucb = child.getUCB1();
        if (ucb > bestUCB) {
          bestUCB = ucb;
          bestChild = child;
        }
      }
      node = bestChild;
    }

    // 2. Expansión: Si el nodo fue visitado y no es terminal, expande sus hijos
    if (node.visits > 0 && !node.isTerminal()) {
      const moves = obtenerMovimientosLegales(node.juego);
      for (const m of moves) {
        const juegoClon = JSON.parse(JSON.stringify(node.juego));
        juegoClon.isSimulation = true;
        const activeRolLargo = juegoClon.ordenTurnos ? juegoClon.ordenTurnos[juegoClon.indiceTurnoActual] : juegoClon.turnoActual;
        const socketId = juegoClon.jugadores[activeRolLargo];
        
        const nextState = gameController.movimiento(juegoClon, socketId, m.tableroId, m.celdaId);
        if (nextState) {
          node.children.push(new MCTSNode(nextState, node, m));
        }
      }
      if (node.children.length > 0) {
        node = node.children[Math.floor(Math.random() * node.children.length)];
      }
    }

    // 3. Simulación (Rollout): Juega de forma aleatoria hasta terminar la partida
    let simulationState = JSON.parse(JSON.stringify(node.juego));
    simulationState.isSimulation = true;
    let limit = 0;
    
    while (simulationState.ganador === null && limit < 120) {
      const moves = obtenerMovimientosLegales(simulationState);
      if (moves.length === 0) break;
      const m = moves[Math.floor(Math.random() * moves.length)];
      
      const activeRolLargo = simulationState.ordenTurnos ? simulationState.ordenTurnos[simulationState.indiceTurnoActual] : simulationState.turnoActual;
      const socketId = simulationState.jugadores[activeRolLargo];
      
      const nextState = gameController.movimiento(simulationState, socketId, m.tableroId, m.celdaId);
      if (!nextState) break;
      simulationState = nextState;
      limit++;
    }

    const result = simulationState.ganador || 'empate';

    // 4. Retropropagación: Envía el resultado al árbol
    backpropagate(node, result);
    iterations++;
  }

 //console.log(`[MCTS] Completado ${iterations} iteraciones para simular el mejor movimiento`);

  if (root.children.length === 0) return null;
  
  // Devuelve la jugada del hijo que tuvo más visitas (la más robusta)
  let bestMoveNode = null;
  let maxVisits = -1;
  for (const child of root.children) {
    if (child.visits > maxVisits) {
      maxVisits = child.visits;
      bestMoveNode = child;
    }
  }

  return bestMoveNode ? bestMoveNode.lastMove : null;
};

// =========================================================================
// === CONTROLADOR DE TURNO DEL BOT (FÁCIL, INTERMEDIO, DIFÍCIL, EXPERTO) ===
// =========================================================================

export const jugarTurnoBot = async (roomId, io) => {
  let dificultad = 'facil';
  try {
    const juegoJson = await redisClient.get(`juego:${roomId}`);
    if (juegoJson) {
      const juegoTemp = JSON.parse(juegoJson);
      dificultad = juegoTemp.configuracion?.dificultadBot || 'facil';
    }
  } catch (err) {
    console.error('[Error Bot] Al obtener configuración inicial:', err);
  }

  // Tiempo de pensamiento dinámico y natural
  const tiempoPensamiento = (dificultad === 'experto')
    ? Math.floor(Math.random() * 400) + 400  // 400ms - 800ms
    : (dificultad === 'dificil')
    ? Math.floor(Math.random() * 600) + 600  // 600ms - 1200ms
    : Math.floor(Math.random() * 1200) + 800; // 800ms - 2000ms
  
  setTimeout(async () => {
    try {
      const juegoJson = await redisClient.get(`juego:${roomId}`);
      if (!juegoJson) return;

      const juego = JSON.parse(juegoJson);

      let currentRolLargo = juego.ordenTurnos ? juego.ordenTurnos[juego.indiceTurnoActual] : juego.turnoActual;
      if (juego.jugadores[currentRolLargo] !== 'BOT' || juego.ganador || juego.estado !== 'jugando') return;
      
      const botRolLargo = currentRolLargo;
      const botRol = botRolLargo.charAt(0);

      let tableroId = juego.tableroActivo !== null ? juego.tableros[juego.tableroActivo].id : null;
      let celdaId = null;

      // 1. Dificultad EXPERTO: Minimax con Poda Alfa-Beta y Heurística Multi-Modo
      if (juego.configuracion?.dificultadBot === 'experto') {
        const expertoMove = obtenerMejorMovimientoExperto(juego, botRol);
        if (expertoMove) {
          tableroId = expertoMove.tableroId;
          celdaId = expertoMove.celdaId;
        }
      }

      // 2. Dificultad DIFÍCIL: Monte Carlo Tree Search (MCTS)
      if (celdaId === null && juego.configuracion?.dificultadBot === 'dificil') {
        const mctsMove = runMCTS(juego, 500);
        if (mctsMove) {
          tableroId = mctsMove.tableroId;
          celdaId = mctsMove.celdaId;
        }
      }

      // 3. Dificultad INTERMEDIO / FÁCIL / Fallback
      if (celdaId === null) {
        if (tableroId === null) {
          const tablerosDisponibles = juego.tableros.filter(t => !t.celdas.every(c => c.valor !== null));
          if (tablerosDisponibles.length === 0) return;
          
          const randomIndex = Math.floor(Math.random() * tablerosDisponibles.length);
          tableroId = tablerosDisponibles[randomIndex].id;
        }
        
        const tablero = juego.tableros.find(t => t.id === tableroId);
        if (!tablero) return;

        if (juego.configuracion?.dificultadBot === 'intermedio') {
          const oponenteRol = botRol === 'X' ? 'O' : 'X';
          
          // Prioridad 1: Reacción Ofensiva - Ganar el tablero local
        // El bot busca si hay alguna celda que le permita alinear 3 y ganar de inmediato
          celdaId = obtenerCeldaGanadora(tablero, botRol);
          
          if (celdaId === null) {
            // Prioridad 2: Reacción Defensiva - Bloquear al oponente
          // Si el bot no puede ganar, verifica si el oponente está a punto de ganar para bloquearlo
            celdaId = obtenerCeldaGanadora(tablero, oponenteRol);
          }

          if (celdaId === null) {
            // Prioridad 3: Evitar regalar el "turno libre"
            // El bot analiza a qué tablero enviará al oponente. Intentará no enviarlo a un tablero que ya esté lleno o ganado, ya que eso le daría la ventaja de jugar en cualquier parte.
            const celdasVacias = tablero.celdas.filter(c => c.valor === null);
            
            const esTableroSeguro = (indice) => {
              const t = juego.tableros[indice];
              if (!t) return false;
              return !t.celdas.every(c => c.valor !== null);
            };

            const celdasSeguras = celdasVacias.filter(c => esTableroSeguro(c.id));
            const opciones = celdasSeguras.length > 0 ? celdasSeguras : celdasVacias;

            // Prioridad 4: Posicionamiento Estratégico Clásico
          // Si no hay riesgo inmediato, el bot prefiere jugar en el centro (4), luego en las esquinas (0, 2, 6, 8) y por último en los bordes (1, 3, 5, 7).
            const preferencia = [4, 0, 2, 6, 8, 1, 3, 5, 7];
            for (const pos of preferencia) {
              if (opciones.some(c => c.id === pos)) {
                celdaId = pos;
                break;
              }
            }
            
            if (celdaId === null && opciones.length > 0) {
              celdaId = opciones[Math.floor(Math.random() * opciones.length)].id;
            }
          }
        }

        if (celdaId === null) {
          // Dificultad Fácil: Jugar en una celda vacía aleatoria
          const celdasVacias = tablero.celdas.filter(c => c.valor === null);
          if (celdasVacias.length === 0) return;

          const randomCeldaIndex = Math.floor(Math.random() * celdasVacias.length);
          celdaId = celdasVacias[randomCeldaIndex].id;
        }
      }

      const movimientoJuego = gameController.movimiento(juego, 'BOT', tableroId, celdaId);

      if (movimientoJuego) {
        if (movimientoJuego.configuracion && movimientoJuego.configuracion.temporizador) {
          movimientoJuego.ultimaActualizacionTurno = Date.now();
        }
        await redisClient.set(`juego:${roomId}`, JSON.stringify(movimientoJuego));

        if (movimientoJuego.ganador) {
          if (turnTimeouts.has(roomId)) {
            clearTimeout(turnTimeouts.get(roomId));
            turnTimeouts.delete(roomId);
          }
          await redisClient.expire(`juego:${roomId}`, 60);
          console.log(`Juego ${roomId} terminado (Bot). Se eliminará en 1 minuto si no se reinicia.`);
          await emitirSalasDisponibles(io);
        }

        io.to(roomId).emit('actualizarJuego', movimientoJuego);
        resetearTimeoutInactividad(roomId, io);
        
        if (!movimientoJuego.ganador) {
          const nuevoTurno = movimientoJuego.turnoActual;
          const nuevoRolLargo = movimientoJuego.ordenTurnos ? 
              movimientoJuego.ordenTurnos[movimientoJuego.indiceTurnoActual] : nuevoTurno;
          if (movimientoJuego.jugadores[nuevoRolLargo] === 'BOT') {
            jugarTurnoBot(roomId, io);
          } else {
            iniciarTimeoutTurno(roomId, io);
          }
        }
      }
    } catch (error) {
      console.error(`[Error Bot] Error ejecutando turno del bot en sala ${roomId}:`, error);
    }
  }, tiempoPensamiento);
};
