import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Tablero } from './tablero';

describe('Tablero', () => {
  let component: Tablero;
  let fixture: ComponentFixture<Tablero>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Tablero]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Tablero);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
