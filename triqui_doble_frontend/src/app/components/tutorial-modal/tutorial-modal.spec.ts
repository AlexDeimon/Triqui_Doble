import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TutorialModal } from './tutorial-modal';

describe('TutorialModal', () => {
  let component: TutorialModal;
  let fixture: ComponentFixture<TutorialModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TutorialModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TutorialModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
