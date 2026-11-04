import { importProvidersFrom } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';
import { bootstrapApplication } from '@angular/platform-browser';
import { AppRoutingModule } from './app/app-routing.module';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [importProvidersFrom(AppRoutingModule), provideHttpClient(withXhr(), withInterceptorsFromDi())],
}).catch(err => console.error(err));
