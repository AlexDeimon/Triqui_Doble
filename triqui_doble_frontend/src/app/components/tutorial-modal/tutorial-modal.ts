import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-tutorial-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tutorial-modal.html',
  styleUrl: './tutorial-modal.css'
})
export class TutorialModalComponent {
  @Input() showModal: boolean = false;
  @Output() close = new EventEmitter<void>();
  @Output() practicarBot = new EventEmitter<void>();

  currentStep: number = 1;
  totalSteps: number = 4;

  // Simulador interactivo
  celdaSeleccionada: number | null = null;
  posicionesTexto: string[] = [
    'Superior Izquierdo', 'Superior Central', 'Superior Derecho',
    'Central Izquierdo', 'Central', 'Central Derecho',
    'Inferior Izquierdo', 'Inferior Central', 'Inferior Derecho'
  ];

  // Acordeón de reglas avanzadas
  reglaAbierta: string | null = null;

  seleccionarCelda(index: number) {
    this.celdaSeleccionada = index;
  }

  toggleRegla(regla: string) {
    this.reglaAbierta = this.reglaAbierta === regla ? null : regla;
  }

  nextStep() {
    if (this.currentStep < this.totalSteps) {
      this.currentStep++;
    }
  }

  prevStep() {
    if (this.currentStep > 1) {
      this.currentStep--;
    }
  }

  cerrar() {
    this.close.emit();
    // Reiniciar estado
    this.currentStep = 1;
    this.celdaSeleccionada = null;
    this.reglaAbierta = null;
  }

  iniciarPractica() {
    this.practicarBot.emit();
    this.cerrar();
  }
}
