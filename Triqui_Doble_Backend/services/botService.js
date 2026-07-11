import { redisClient } from '../config/db.js';
import * as gameController from '../controllers/game.js';
import { turnTimeouts, resetearTimeoutInactividad, iniciarTimeoutTurno, emitirSalasDisponibles } from './roomService.js';

const obtenerCeldaGanadora = (tablero, rol) => {
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

// --- Algoritmo Monte Carlo Tree Search (MCTS) para Dificultad Difícil ---

class MCTSNode {
  constructor(juego, parent = null, lastMove = null) {
    this.juego = juego; // Clon del estado del juego
    this.parent = parent;
    this.lastMove = lastMove; // { tableroId, celdaId }
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
    const tablerosDisponibles = juego.tableros.filter(t => {
      const estaLleno = t.celdas.every(c => c.valor !== null);
      const tieneGanador = t.ganador !== null;
      return !estaLleno && (juego.configuracion?.robarTableros || !tieneGanador);
    });
    
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

// Ejecuta la búsqueda MCTS durante un tiempo determinado (500ms para evitar sobrecargar)
const runMCTS = (juegoOriginal, timeLimitMs = 1000) => {
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

  // Si es difícil, usamos menos delay inicial porque MCTS toma 1000ms en calcular
  const tiempoPensamiento = dificultad === 'dificil'
    ? Math.floor(Math.random() * 1000) + 1000  // 1000ms - 2000ms
    : Math.floor(Math.random() * 1500) + 1000; // 1000ms - 2500ms
  
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

      // Si es difícil, ejecutamos MCTS (Monte Carlo Tree Search)
      if (juego.configuracion?.dificultadBot === 'dificil') {
        const mctsMove = runMCTS(juego, 500); // Pensamiento MCTS de 500ms
        if (mctsMove) {
          tableroId = mctsMove.tableroId;
          celdaId = mctsMove.celdaId;
        }
      }

      // Si no es difícil, o si el MCTS falló como fallback
      if (celdaId === null) {
        if (tableroId === null) {
          const tablerosDisponibles = juego.tableros.filter(t => {
            const estaLleno = t.celdas.every(c => c.valor !== null);
            const tieneGanador = t.ganador !== null;
            return !estaLleno && (juego.configuracion?.robarTableros || !tieneGanador);
          });
          
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
              const estaLleno = t.celdas.every(c => c.valor !== null);
              const tieneGanador = t.ganador !== null;
              return !estaLleno && (!tieneGanador || juego.configuracion?.robarTableros);
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
