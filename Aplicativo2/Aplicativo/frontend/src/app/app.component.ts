import { Component } from '@angular/core';
import { PredictorComponent } from './features/predictor/predictor.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PredictorComponent],
  template: `<app-predictor />`,
  styles: [`
    :host { display: block; min-height: 100vh; }
  `],
})
export class AppComponent {}
