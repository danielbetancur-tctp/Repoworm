import { Injectable } from '@angular/core';
// `xlsx` solo se importa como TIPO (se borra en compilación, no pesa en el bundle).
// La librería real se carga de forma diferida en `parse()` con import() dinámico,
// para no incluirla en el bundle inicial.
import type * as XLSXType from 'xlsx';
import { EnvironmentalData, EnvironmentalKey } from '../models/prediction.model';

/**
 * Resultado del parseo de un archivo Excel de variables ambientales.
 */
export interface ExcelParseResult {
  /** Variables reconocidas y su valor numérico. */
  data: EnvironmentalData;
  /** Nombres de columna que sí pudieron mapearse a una variable conocida. */
  matchedColumns: string[];
  /** Encabezados presentes en el archivo que no se reconocieron. */
  unknownColumns: string[];
}

/**
 * Servicio dedicado a extraer las variables ambientales desde un archivo
 * Excel (.xlsx / .xls).
 *
 * Responsabilidad única: transformar el binario del archivo en un objeto
 * `EnvironmentalData` tipado. No toca el DOM ni el formulario; el componente
 * decide cómo usar el resultado. El emparejamiento de columnas es tolerante a
 * mayúsculas, acentos, unidades y espacios.
 */
@Injectable({ providedIn: 'root' })
export class ExcelParserService {
  /**
   * Diccionario de alias por variable. Las claves se normalizan (sin acentos,
   * minúsculas, sin caracteres no alfanuméricos) antes de comparar.
   */
  private readonly aliasMap: Record<EnvironmentalKey, string[]> = {
    humedad_trama_pct: ['humedad', 'humedadtrama', 'humedadpct', 'humedadtramapct', 'humidity'],
    temperatura_trama_c: ['temperatura', 'temperaturatrama', 'temperaturatramac', 'temp', 'temperature'],
    intensidad_uv_indice: ['intensidaduv', 'uv', 'indiceuv', 'uvindex', 'intensidadultravioleta'],
    conductividad_trama_us_cm: ['conductividad', 'conductividadtrama', 'conductividadtramauscm', 'conductivity', 'ec'],
    ph_trama: ['ph', 'phtrama'],
    nitrogeno_trama_mg_kg: ['nitrogeno', 'nitrogenotrama', 'nitrogenotramamgkg', 'n', 'nitrogen'],
    fosforo_trama_mg_kg: ['fosforo', 'fosforotrama', 'fosforotramamgkg', 'p', 'phosphorus'],
    potasio_trama_mg_kg: ['potasio', 'potasiotrama', 'potasiotramamgkg', 'k', 'potassium'],
  };

  /**
   * Lee y parsea el archivo. Toma la primera hoja y su primera fila de datos.
   *
   * @throws Error con mensaje legible si el archivo es inválido o vacío.
   */
  async parse(file: File): Promise<ExcelParseResult> {
    const buffer = await this.readAsArrayBuffer(file);

    // Carga diferida de la librería (queda fuera del bundle inicial).
    const XLSX = await import('xlsx');

    let workbook: XLSXType.WorkBook;
    try {
      workbook = XLSX.read(buffer, { type: 'array' });
    } catch {
      throw new Error('No se pudo leer el archivo Excel. Verifique que no esté dañado.');
    }

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('El archivo Excel no contiene ninguna hoja.');
    }

    const sheet = workbook.Sheets[firstSheetName];
    // `defval: null` conserva celdas vacías; leemos como matriz de objetos.
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });

    if (rows.length === 0) {
      throw new Error('La hoja de Excel no contiene filas de datos.');
    }

    const firstRow = rows[0];
    const data: EnvironmentalData = {};
    const matchedColumns: string[] = [];
    const unknownColumns: string[] = [];

    for (const [rawHeader, rawValue] of Object.entries(firstRow)) {
      const key = this.resolveKey(rawHeader);
      if (!key) {
        unknownColumns.push(rawHeader);
        continue;
      }

      const value = this.toNumber(rawValue);
      if (value !== null) {
        data[key] = value;
        matchedColumns.push(rawHeader);
      }
    }

    if (matchedColumns.length === 0) {
      throw new Error(
        'No se reconoció ninguna columna de variables ambientales en el archivo. ' +
          'Use encabezados como Humedad, Temperatura, pH, Nitrógeno, etc.'
      );
    }

    return { data, matchedColumns, unknownColumns };
  }

  /** Encuentra la clave de variable correspondiente a un encabezado. */
  private resolveKey(header: string): EnvironmentalKey | null {
    const normalized = this.normalize(header);
    for (const key of Object.keys(this.aliasMap) as EnvironmentalKey[]) {
      if (this.aliasMap[key].includes(normalized)) {
        return key;
      }
    }
    return null;
  }

  /** Normaliza texto: sin acentos, minúsculas y solo caracteres alfanuméricos. */
  private normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // elimina marcas diacríticas (acentos)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  /** Convierte un valor de celda a número; acepta coma decimal. `null` si no aplica. */
  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = parseFloat(String(value).replace(',', '.').trim());
    return Number.isNaN(parsed) ? null : parsed;
  }

  /** Promisifica la lectura del archivo como ArrayBuffer. */
  private readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(new Error('Error al leer el archivo Excel.'));
      reader.readAsArrayBuffer(file);
    });
  }
}
