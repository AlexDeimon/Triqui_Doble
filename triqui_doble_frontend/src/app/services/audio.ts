import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})

export class AudioService {
  // El contexto principal de audio.
  private audioContext: AudioContext;

  constructor() {
    // Inicializamos el AudioContext.
    // (window as any).webkitAudioContext es para compatibilidad con navegadores antiguos como Safari viejos.
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  /**
   * Reproduce un sonido de "bip" suave y ascendente para confirmar una jugada válida.
   */
  playMoveSound() {
    // Los navegadores suspenden el audio si no hay interacción del usuario.
    // Aquí nos aseguramos de reactivarlo antes de tocar cualquier sonido.
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // 1. Crear el oscilador: Es el generador de la onda de sonido (la fuente).
    const oscillator = this.audioContext.createOscillator();

    // 2. Crear el nodo de ganancia: Sirve para controlar el volumen.
    const gainNode = this.audioContext.createGain();

    // Configuración del sonido:
    // Tipo 'sine' (senoidal) produce un sonido puro y suave, ideal para notificaciones agradables.
    oscillator.type = 'sine';

    // Configuración de la frecuencia (tono):
    // Empezamos en 600Hz (un tono medio).
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime);
    // Subimos exponencialmente a 1200Hz en 0.1 segundos. Esto crea el efecto de "bip" ascendente.
    oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.1);

    // Configuración del volumen:
    // Empezamos con volumen 0.1 (10% del máximo) para que no sea muy fuerte.
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    // Bajamos el volumen a casi 0 (0.01) en 0.1 segundos.
    // Esto hace un "fade out" rápido para que el sonido no corte de golpe (evita el "click" al final).
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);

    // 3. Conexiones (Cables virtuales):
    // Conectamos: Oscilador -> Control de Volumen (Gain) -> Altavoces (Destination)
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // 4. Reproducción:
    oscillator.start(); // Iniciar sonido ahora mismo.
    oscillator.stop(this.audioContext.currentTime + 0.1); // Detenerlo automáticamente después de 0.1 segundos.
  }

  /**
   * Reproduce un sonido grave para indicar un error o acción bloqueada.
   */
  playErrorSound() {
    // Reactivar contexto si está suspendido.
    if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
    }

    // Nodos nuevos para este sonido (no se pueden reusar los anteriores una vez parados).
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    // Configuración del sonido:
    // Tipo 'sawtooth' (diente de sierra) tiene más armónicos y suena más "áspero".
    oscillator.type = 'sawtooth';

    // Frecuencia:
    // Empezamos en 150Hz (tono grave).
    oscillator.frequency.setValueAtTime(150, this.audioContext.currentTime);
    // Bajamos a 100Hz en 0.15 segundos.
    oscillator.frequency.linearRampToValueAtTime(100, this.audioContext.currentTime + 0.15);

    // Volumen:
    // Empieza en 0.1 y baja a 0.01 para terminar suavemente.
    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.01, this.audioContext.currentTime + 0.15);

    // Conexiones
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    // Reproducción
    oscillator.start();
    oscillator.stop(this.audioContext.currentTime + 0.15);
  }
}
