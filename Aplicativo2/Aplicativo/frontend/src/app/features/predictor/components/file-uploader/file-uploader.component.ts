import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

/** Paleta de acento admitida por el componente (coincide con las variables CSS). */
export type UploaderAccent = 'blue' | 'green' | 'orange';

/**
 * Componente de subida de archivos genérico y reutilizable.
 *
 * Responsabilidad única: presentar una "drop-zone" con soporte para
 * arrastrar-y-soltar y selección manual, validar el archivo (extensión y
 * tamaño) y emitir el resultado hacia el componente padre. No conoce la
 * lógica de negocio (imágenes, modelos, Excel): se configura por completo
 * mediante @Input, de modo que puede emplearse para cualquier tipo de archivo.
 */
@Component({
  selector: 'app-file-uploader',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './file-uploader.component.html',
  styleUrls: ['./file-uploader.component.scss'],
})
export class FileUploaderComponent {
  /** Extensiones aceptadas, en minúscula y con punto (p. ej. ['.onnx']). */
  @Input({ required: true }) accept: string[] = [];

  /** Tamaño máximo permitido en megabytes. */
  @Input({ required: true }) maxSizeMb = 10;

  /** Texto principal mostrado dentro de la zona de arrastre. */
  @Input() title = 'Arrastra tu archivo aquí';

  /** Etiqueta del botón de selección manual. */
  @Input() buttonLabel = 'Seleccionar archivo';

  /** Texto de ayuda mostrado bajo el botón. */
  @Input() hint = '';

  /** Icono de Material mostrado en el estado vacío. */
  @Input() icon = 'upload_file';

  /** Color de acento del componente. */
  @Input() accent: UploaderAccent = 'blue';

  /**
   * Archivo actualmente seleccionado (controlado por el padre). Cuando es
   * distinto de `null` el componente muestra el "chip" del archivo.
   */
  @Input() selectedFile: File | null = null;

  /** Deshabilita la interacción (p. ej. cuando otra opción está activa). */
  @Input() disabled = false;

  /** Identificador único para asociar el <label> con el <input type="file">. */
  @Input() inputId = `file-input-${Math.random().toString(36).slice(2, 9)}`;

  /** Emite el archivo cuando pasa la validación. */
  @Output() fileSelected = new EventEmitter<File>();

  /** Emite cuando el usuario elimina el archivo seleccionado. */
  @Output() fileCleared = new EventEmitter<void>();

  /** Emite el mensaje de error de validación (o `null` al limpiarlo). */
  @Output() validationError = new EventEmitter<string | null>();

  readonly isDragOver = signal(false);
  readonly errorMessage = signal<string | null>(null);

  /** Cadena `accept` para el atributo nativo del input. */
  readonly acceptAttr = computed(() => this.accept.join(','));

  /** Tamaño legible del archivo seleccionado. */
  get selectedFileSize(): string {
    return this.selectedFile ? this.formatBytes(this.selectedFile.size) : '';
  }

  // ── Eventos de arrastrar y soltar ──────────────────────────────────────────
  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    if (this.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    if (this.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (file) this.processFile(file);
  }

  // ── Selección manual ───────────────────────────────────────────────────────
  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.processFile(file);
    // Reinicia el valor para permitir volver a elegir el mismo archivo.
    input.value = '';
  }

  /** Elimina la selección actual y notifica al padre. */
  clearFile(event: MouseEvent): void {
    event.stopPropagation();
    this.setError(null);
    this.fileCleared.emit();
  }

  // ── Validación ─────────────────────────────────────────────────────────────
  /** Valida extensión y tamaño; emite el archivo o el error correspondiente. */
  private processFile(file: File): void {
    this.setError(null);

    const dotIndex = file.name.lastIndexOf('.');
    const ext = dotIndex >= 0 ? file.name.slice(dotIndex).toLowerCase() : '';

    if (!this.accept.includes(ext)) {
      this.setError(
        `Formato no permitido${ext ? ` (${ext})` : ''}. Formatos válidos: ${this.accept.join(', ')}.`
      );
      return;
    }

    const maxBytes = this.maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      this.setError(
        `El archivo pesa ${this.formatBytes(file.size)} y supera el máximo de ${this.maxSizeMb} MB.`
      );
      return;
    }

    if (file.size === 0) {
      this.setError('El archivo está vacío.');
      return;
    }

    this.fileSelected.emit(file);
  }

  /** Actualiza el estado de error interno y lo propaga al padre. */
  private setError(message: string | null): void {
    this.errorMessage.set(message);
    this.validationError.emit(message);
  }

  /** Formatea bytes a una cadena legible (KB / MB). */
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }
}
