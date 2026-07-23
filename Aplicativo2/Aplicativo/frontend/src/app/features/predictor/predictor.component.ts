import { Component, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';

import { FileUploaderComponent } from './components/file-uploader/file-uploader.component';
import { ResultsPanelComponent } from './components/results-panel/results-panel.component';
import { PredictionService } from '../../core/services/prediction.service';
import { ExcelParserService } from '../../core/services/excel-parser.service';
import {
  PredictionData,
  ModelInfo,
  ModelType,
  NavTab,
  EnvironmentalData,
  EnvironmentalKey,
} from '../../core/models/prediction.model';

/** Descriptor de un campo de variable ambiental para renderizar la grilla. */
interface EnvFieldDef {
  key: EnvironmentalKey;
  label: string;
  placeholder: string;
  min?: number;
  max?: number;
  step: number;
}

@Component({
  selector: 'app-predictor',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
    FileUploaderComponent,
    ResultsPanelComponent,
  ],
  templateUrl: './predictor.component.html',
  styleUrls: ['./predictor.component.scss'],
})
export class PredictorComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly svc = inject(PredictionService);
  private readonly excel = inject(ExcelParserService);
  private readonly snack = inject(MatSnackBar);

  // ── Constantes de configuración de subidas ────────────────────────────────
  readonly IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp'];
  readonly IMAGE_MAX_MB = 10;
  readonly MODEL_EXTENSIONS = ['.onnx'];
  readonly MODEL_MAX_MB = 50;
  readonly EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
  readonly EXCEL_MAX_MB = 10;

  // ── Navegación ─────────────────────────────────────────────────────────────
  activeTab = signal<NavTab>('probar');

  readonly navItems: { id: NavTab; label: string; icon: string }[] = [
    { id: 'probar', label: 'PROBAR MODELO', icon: 'home' },
    { id: 'resultados', label: 'RESULTADOS', icon: 'bar_chart' },
    { id: 'contexto', label: 'CONTEXTO', icon: 'menu_book' },
    { id: 'acerca', label: 'ACERCA DE', icon: 'info' },
  ];

  // ── Definición de la grilla de variables ambientales ──────────────────────
  readonly envFields: EnvFieldDef[] = [
    { key: 'humedad_trama_pct', label: 'Humedad (%)', placeholder: 'Opcional', min: 0, max: 100, step: 0.1 },
    { key: 'temperatura_trama_c', label: 'Temperatura (°C)', placeholder: 'Opcional', min: -20, max: 60, step: 0.1 },
    { key: 'conductividad_trama_us_cm', label: 'Conductividad (µS/cm)', placeholder: 'Opcional', min: 0, step: 1 },
    { key: 'ph_trama', label: 'pH', placeholder: 'Opcional', min: 0, max: 14, step: 0.1 },
    { key: 'nitrogeno_trama_mg_kg', label: 'Nitrógeno (mg/kg)', placeholder: 'Opcional', min: 0, step: 1 },
    { key: 'fosforo_trama_mg_kg', label: 'Fósforo (mg/kg)', placeholder: 'Opcional', min: 0, step: 1 },
    { key: 'potasio_trama_mg_kg', label: 'Potasio (mg/kg)', placeholder: 'Opcional', min: 0, step: 1 },
  ];

  // ── Estado ───────────────────────────────────────────────────────────────
  selectedImage = signal<File | null>(null);
  imagePreviewUrl = signal<string | null>(null);
  customModelFile = signal<File | null>(null);
  excelFile = signal<File | null>(null);

  isLoading = signal(false);
  result = signal<PredictionData | null>(null);
  errorMessage = signal<string | null>(null);
  availableModels = signal<ModelInfo[]>([]);

  /** Se puede enviar si hay imagen, un modelo (integrado o personalizado) y el form es válido. */
  canSubmit = computed(() => {
    const hasImage = this.selectedImage() !== null;
    const hasModel = this.customModelFile() !== null || !!this.form.get('modelType')?.value;
    return hasImage && hasModel && !this.isLoading();
  });

  // ── Formulario ────────────────────────────────────────────────────────────
  form = this.fb.group({
    modelType: ['' as ModelType, []],
    realValueGrams: [null as number | null, [Validators.min(0), Validators.max(500)]],
    humedad_trama_pct: [null as number | null, [Validators.min(0), Validators.max(100)]],
    temperatura_trama_c: [null as number | null, [Validators.min(-20), Validators.max(60)]],
    conductividad_trama_us_cm: [null as number | null, [Validators.min(0)]],
    ph_trama: [null as number | null, [Validators.min(0), Validators.max(14)]],
    nitrogeno_trama_mg_kg: [null as number | null, [Validators.min(0)]],
    fosforo_trama_mg_kg: [null as number | null, [Validators.min(0)]],
    potasio_trama_mg_kg: [null as number | null, [Validators.min(0)]],
  });

  ngOnInit(): void {
    this.svc.getModels().subscribe({
      next: (m) => {
        this.availableModels.set(m);
        if (m.length > 0) {
          this.form.patchValue({ modelType: m[0].id });
        }
      },
      error: () => this.availableModels.set([]),
    });
  }

  // ── Navegación ─────────────────────────────────────────────────────────────
  setTab(tab: NavTab): void {
    this.activeTab.set(tab);
    if (tab === 'resultados' && this.result()) {
      setTimeout(
        () => document.getElementById('results-section')?.scrollIntoView({ behavior: 'smooth' }),
        100
      );
    }
  }

  // ── Sección 1: Modelo ──────────────────────────────────────────────────────
  /** El usuario subió un modelo personalizado: se ignora el modelo integrado. */
  onCustomModelSelected(file: File): void {
    this.customModelFile.set(file);
    this.form.get('modelType')?.disable();
    this.errorMessage.set(null);
  }

  onCustomModelCleared(): void {
    this.customModelFile.set(null);
    this.form.get('modelType')?.enable();
  }

  // ── Sección 2: Imagen ──────────────────────────────────────────────────────
  onImageSelected(file: File): void {
    this.selectedImage.set(file);
    this.result.set(null);
    this.errorMessage.set(null);

    // Vista previa de la imagen original cargada por el usuario.
    const reader = new FileReader();
    reader.onload = (e) => {
      // Evita sobrescribir una selección posterior si la lectura se demora.
      if (this.selectedImage() === file) {
        this.imagePreviewUrl.set(e.target?.result as string);
      }
    };
    reader.readAsDataURL(file);
  }

  onImageCleared(): void {
    this.selectedImage.set(null);
    this.imagePreviewUrl.set(null);
    this.result.set(null);
    this.errorMessage.set(null);
  }

  // ── Sección 3: Data tabular (Excel) ────────────────────────────────────────
  /** Parsea el Excel y rellena automáticamente los campos de variables. */
  async onExcelSelected(file: File): Promise<void> {
    this.excelFile.set(file);
    try {
      const { data, matchedColumns } = await this.excel.parse(file);
      this.patchEnvFields(data);
      this.snack.open(
        `Excel procesado: ${matchedColumns.length} variable(s) cargada(s).`,
        'Cerrar',
        { duration: 4000, panelClass: ['snack-success'] }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo procesar el archivo Excel.';
      this.excelFile.set(null);
      this.snack.open(message, 'Cerrar', { duration: 6000, panelClass: ['snack-error'] });
    }
  }

  onExcelCleared(): void {
    this.excelFile.set(null);
  }

  /** Escribe en el formulario solo las variables reconocidas en el Excel. */
  private patchEnvFields(data: EnvironmentalData): void {
    (Object.keys(data) as EnvironmentalKey[]).forEach((key) => {
      const value = data[key];
      if (value !== undefined) {
        this.form.get(key)?.setValue(value);
      }
    });
  }

  // ── Envío ───────────────────────────────────────────────────────────────────
  onSubmit(): void {
    // Validaciones de guarda antes de disparar la petición.
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revise los valores ingresados: hay campos fuera de rango.');
      return;
    }
    if (!this.selectedImage()) {
      this.errorMessage.set('Debe subir una imagen térmica (obligatorio).');
      return;
    }
    if (!this.canSubmit()) {
      this.errorMessage.set('Seleccione un modelo integrado o suba un modelo personalizado (.onnx).');
      return;
    }

    const raw = this.form.getRawValue();
    const modelType = this.customModelFile() ? null : (raw.modelType as ModelType);

    const envData: EnvironmentalData = {
      humedad_trama_pct: raw.humedad_trama_pct ?? undefined,
      temperatura_trama_c: raw.temperatura_trama_c ?? undefined,
      conductividad_trama_us_cm: raw.conductividad_trama_us_cm ?? undefined,
      ph_trama: raw.ph_trama ?? undefined,
      nitrogeno_trama_mg_kg: raw.nitrogeno_trama_mg_kg ?? undefined,
      fosforo_trama_mg_kg: raw.fosforo_trama_mg_kg ?? undefined,
      potasio_trama_mg_kg: raw.potasio_trama_mg_kg ?? undefined,
    };

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.result.set(null);

    this.svc
      .predict(this.selectedImage()!, modelType, {
        realValueGrams: raw.realValueGrams ?? undefined,
        envData,
        customModelFile: this.customModelFile(),
      })
      .subscribe({
        next: (data) => {
          this.result.set(data);
          this.isLoading.set(false);
          this.snack.open('Predicción completada', 'Cerrar', {
            duration: 3000,
            panelClass: ['snack-success'],
          });
          this.setTab('resultados');
        },
        error: (err: Error) => {
          this.isLoading.set(false);
          this.errorMessage.set(err.message);
          this.snack.open(err.message, 'Cerrar', { duration: 6000, panelClass: ['snack-error'] });
        },
      });
  }

  // ── Reinicio ────────────────────────────────────────────────────────────────
  onReset(): void {
    this.result.set(null);
    this.errorMessage.set(null);
    this.selectedImage.set(null);
    this.imagePreviewUrl.set(null);
    this.customModelFile.set(null);
    this.excelFile.set(null);

    const models = this.availableModels();
    this.form.get('modelType')?.enable();
    this.form.reset({
      modelType: models.length > 0 ? models[0].id : '',
      realValueGrams: null,
      humedad_trama_pct: null,
      temperatura_trama_c: null,
      conductividad_trama_us_cm: null,
      ph_trama: null,
      nitrogeno_trama_mg_kg: null,
      fosforo_trama_mg_kg: null,
      potasio_trama_mg_kg: null,
    });
    this.setTab('probar');
  }
}
