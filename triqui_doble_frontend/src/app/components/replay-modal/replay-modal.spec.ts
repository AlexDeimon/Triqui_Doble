import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ReplayModal } from './replay-modal';

describe('ReplayModal', () => {
  let component: ReplayModal;
  let fixture: ComponentFixture<ReplayModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ReplayModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ReplayModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
