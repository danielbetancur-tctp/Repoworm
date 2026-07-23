import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  SimpleChanges,
  AfterViewInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  computed,
  signal,
} from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Chart, registerables } from 'chart.js';

import { PredictionData } from '../../../../core/models/prediction.model';

Chart.register(...registerables);

/** Descriptor de una tarjeta de métrica (KPI) para renderizar la fila superior. */
interface MetricCard {
  label: string;
  sublabel: string;
  value: string;
  description: string;
  icon: string;
  accent: 'green' | 'purple' | 'blue' | 'orange';
}

/** Identificador de cada gráfica (para exportación). */
type ChartKind = 'regression' | 'comparison';

/**
 * Panel de resultados de la predicción.
 *
 * Responsabilidad única: presentar los datos de una `PredictionData`. Solo se
 * muestran métricas y gráficas que se derivan REALMENTE de la predicción. Ambas
 * gráficas (regresión y comparación) contrastan la predicción en gramos contra
 * el dato real ingresado por el usuario y se ocultan si dicho dato no existe.
 */
@Component({
  selector: 'app-results-panel',
  standalone: true,
  imports: [CommonModule, DecimalPipe, DatePipe, MatIconModule, MatButtonModule, MatTooltipModule],
  templateUrl: './results-panel.component.html',
  styleUrls: ['./results-panel.component.scss'],
})
export class ResultsPanelComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input({ required: true })
  set data(value: PredictionData) {
    this._data = value;
    this.dataSignal.set(value);
  }
  get data(): PredictionData {
    return this._data;
  }
  private _data!: PredictionData;
  private readonly dataSignal = signal<PredictionData | null>(null);

  @Output() resetRequest = new EventEmitter<void>();

  @ViewChild('regressionChart') regressionCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('comparisonChart') comparisonCanvas?: ElementRef<HTMLCanvasElement>;

  private regressionChart: Chart | null = null;
  private comparisonChart: Chart | null = null;
  private viewInitialized = false;

  // ── Datos derivados para la plantilla ──────────────────────────────────────
  /** Nombre legible del modelo (CatBoost / Random Forest / archivo personalizado). */
  readonly modelDisplayName = computed(() => {
    const model = this.dataSignal()?.modelUsed ?? '';
    const name = model.toLowerCase();
    if (name.includes('catboost')) return 'CatBoost';
    if (name.includes('rf') || name.includes('random') || name.includes('forest')) return 'Random Forest';
    return model.replace(/\.onnx$/i, '') || '—';
  });

  /** Tarjetas KPI de la fila superior (solo valores derivados de la predicción). */
  readonly metricCards = computed<MetricCard[]>(() => {
    const d = this.dataSignal();
    if (!d) return [];

    return [
      {
        label: 'Cantidad estimada',
        sublabel: '(gramos)',
        value: `${this.format(d.prediction.grams, 2)} g`,
        description: 'Cantidad total estimada de lombrices',
        icon: 'monitor_weight',
        accent: 'green',
      },
      {
        label: 'Densidad estimada',
        sublabel: '(lombrices / 100 cm³)',
        value: this.format(d.densityPerCm2, 2),
        description: 'Densidad estimada en la unidad experimental',
        icon: 'grain',
        accent: 'purple',
      },
      {
        label: 'Modelo utilizado',
        sublabel: '',
        value: this.modelDisplayName(),
        description: 'Modelo de IA utilizado para la predicción',
        icon: 'model_training',
        accent: 'blue',
      },
    ];
  });

  /** Hay dato real → se pueden mostrar las gráficas comparativas. */
  readonly hasRealValue = computed(() => !!this.dataSignal()?.realValue);

  // ── Ciclo de vida ──────────────────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.buildCharts();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.viewInitialized) {
      // Espera un tick para que los *@if* rendericen los <canvas> antes de graficar.
      setTimeout(() => this.buildCharts());
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  private destroyCharts(): void {
    this.regressionChart?.destroy();
    this.comparisonChart?.destroy();
    this.regressionChart = this.comparisonChart = null;
  }

  private buildCharts(): void {
    if (!this.dataSignal()?.realValue) {
      this.destroyCharts();
      return;
    }
    this.buildRegressionChart();
    this.buildComparisonChart();
  }

  // ── Gráfica 1: Regresión lineal (Predicción vs Dato real) ──────────────────
  private buildRegressionChart(): void {
    this.regressionChart?.destroy();
    this.regressionChart = null;

    const d = this.dataSignal();
    const ctx = this.regressionCanvas?.nativeElement?.getContext('2d');
    if (!ctx || !d?.realValue) return;

    const real = d.realValue.grams;
    const predicted = d.prediction.grams;
    // Escala común para ambos ejes, redondeada a la decena superior.
    const axisMax = Math.ceil(Math.max(real, predicted, 10) / 10) * 10;

    this.regressionChart = new Chart(ctx, {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Predicción vs. real',
            data: [{ x: real, y: predicted }],
            backgroundColor: '#f06811',
            borderColor: '#fff',
            borderWidth: 1.5,
            pointRadius: 8,
            pointHoverRadius: 10,
          },
          {
            label: 'Predicción ideal (y = x)',
            type: 'line',
            data: [{ x: 0, y: 0 }, { x: axisMax, y: axisMax }],
            borderColor: '#94a3b8',
            borderWidth: 1.5,
            borderDash: [6, 5],
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: (c) => ` Real: ${this.format(c.parsed.x, 2)} g · Predicción: ${this.format(c.parsed.y, 2)} g`,
            },
          },
        },
        scales: {
          x: {
            type: 'linear',
            min: 0,
            max: axisMax,
            title: { display: true, text: 'Dato real (g)', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,.05)' },
          },
          y: {
            min: 0,
            max: axisMax,
            title: { display: true, text: 'Predicción (g)', font: { size: 11 } },
            grid: { color: 'rgba(0,0,0,.05)' },
          },
        },
      },
    });
  }

  // ── Gráfica 2: Comparación en gramos (Estimado vs Real), en barras ─────────
  private buildComparisonChart(): void {
    this.comparisonChart?.destroy();
    this.comparisonChart = null;

    const d = this.dataSignal();
    const ctx = this.comparisonCanvas?.nativeElement?.getContext('2d');
    if (!ctx || !d?.realValue) return;

    const estimated = d.prediction.grams;
    const real = d.realValue.grams;

    this.comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Cantidad de lombrices (g)'],
        datasets: [
          {
            label: 'Valor estimado',
            data: [estimated],
            backgroundColor: 'rgba(124,58,237,.85)',
            borderColor: '#7c3aed',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.55,
            categoryPercentage: 0.6,
          },
          {
            label: 'Dato real',
            data: [real],
            backgroundColor: 'rgba(0,68,138,.12)',
            borderColor: '#00448a',
            borderWidth: 2,
            borderRadius: 4,
            barPercentage: 0.55,
            categoryPercentage: 0.6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 14, usePointStyle: true, font: { size: 11 } } },
          tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${this.format(c.parsed.y, 2)} g` } },
        },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: 'Gramos (g)', font: { size: 11 } },
          },
          x: { grid: { display: false } },
        },
      },
    });
  }

  // ── Exportación ────────────────────────────────────────────────────────────
  /** Descarga una gráfica como imagen PNG. */
  exportChart(kind: ChartKind): void {
    const chart = kind === 'regression' ? this.regressionChart : this.comparisonChart;
    if (!chart) return;

    const a = document.createElement('a');
    a.href = chart.toBase64Image('image/png', 1);
    a.download = `${kind}_${this.dataSignal()?.modelUsed ?? 'modelo'}_${Date.now()}.png`;
    a.click();
  }

  // ── Utilidades ───────────────────────────────────────────────────────────────
  /** Formatea un número con separador y N decimales, tolerante a nulos. */
  private format(value: number | null | undefined, decimals: number): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return value.toLocaleString('es-CO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
}
