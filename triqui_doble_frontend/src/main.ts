import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { AppComponent } from './app/app.component';
import { provideRouter } from '@angular/router';
import { routes } from './app/app.routes';
import { importProvidersFrom } from '@angular/core';
import { ngxLoadingAnimationTypes, NgxLoadingModule } from 'ngx-loading';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    importProvidersFrom(NgxLoadingModule.forRoot({
      animationType: ngxLoadingAnimationTypes.circleSwish,
      primaryColour: '#e94560',
    }))
  ]
}).catch(err => console.error(err));
