import { Injectable, NgZone } from '@angular/core';
import Swal from 'sweetalert2';

interface ModalEntry {
  closeHandler: () => void;
  poppedByPopState: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ModalHistoryService {
  private modalStateCount = 0;
  private isManualClose = false;
  private activeModalEntries: ModalEntry[] = [];

  constructor(private ngZone: NgZone) {
    window.addEventListener('popstate', (event) => {
      this.handlePopState(event);
    });
  }

  public pushModal(closeHandler: () => void): () => void {
    const entry: ModalEntry = {
      closeHandler,
      poppedByPopState: false
    };

    this.modalStateCount++;
    this.activeModalEntries.push(entry);
    window.history.pushState({ modalOpen: true, count: this.modalStateCount }, '');

    let unregistered = false;

    return () => {
      if (unregistered) return;
      unregistered = true;

      const idx = this.activeModalEntries.indexOf(entry);
      if (idx !== -1) {
        this.activeModalEntries.splice(idx, 1);
      }

      if (entry.poppedByPopState) {
        return;
      }

      if (this.modalStateCount > 0) {
        this.modalStateCount--;
        this.isManualClose = true;
        window.history.back();
      }
    };
  }

  public isModalOpen(): boolean {
    return this.activeModalEntries.length > 0 || (typeof Swal !== 'undefined' && Swal.isVisible());
  }

  private handlePopState(event: PopStateEvent) {
    if (this.isManualClose) {
      this.isManualClose = false;
      return;
    }

    this.ngZone.run(() => {
      if (this.activeModalEntries.length > 0) {
        const entry = this.activeModalEntries.pop();
        if (entry) {
          entry.poppedByPopState = true;
          if (this.modalStateCount > 0) {
            this.modalStateCount--;
          }
          entry.closeHandler();
        }
      } else if (typeof Swal !== 'undefined' && Swal.isVisible()) {
        Swal.close();
      }
    });
  }

  public clearAllModals() {
    this.activeModalEntries = [];
    this.modalStateCount = 0;
  }
}
