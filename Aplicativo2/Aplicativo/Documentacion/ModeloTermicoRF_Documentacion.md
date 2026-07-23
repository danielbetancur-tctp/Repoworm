# Sistema de Estimación de Densidad de Lombrices Rojas
## Análisis de Imágenes Térmicas mediante Machine Learning

---

## Modelo Seleccionado: Random Forest Regressor (Ensamble de Árboles de Decisión)

### ¿Por qué Random Forest y no otro modelo?

El dataset tiene sólo 26 imágenes, lo que lo convierte en un escenario de datos escasos (*small-sample learning*). En este contexto, Random Forest es idóneo
por las siguientes razones fundamentales:

### 1. Ensamble de Árboles — Reducción de Varianza

Combina 150 árboles de decisión entrenados con subconjuntos aleatorios de
muestras y features (*bagging + feature randomness*). El promedio de sus
predicciones cancela los errores individuales, reduciendo la varianza que
un árbol único produciría con sólo 26 muestras.

### 2. Invariante a la Escala de Features

A diferencia de SVR, Random Forest no requiere que las features estén
normalizadas. Esto es ventajoso cuando las features tienen escalas muy
distintas (conteos de píxeles en miles vs. proporciones en 0-1).

### 3. Importancia de Features Automática

Calcula el aporte de cada feature a la reducción del error (impureza Gini
o varianza). Permite identificar qué patrones de píxeles son realmente
discriminativos para estimar la densidad de lombrices.

### 4. Comparación con Alternativas

| Modelo | Veredicto |
|---|---|
| **SVR** | Requiere escalado y es sensible a features ruidosas; con pocas muestras su búsqueda de hiperparámetros puede colapsar al predecir la media. |
| **Redes Neuronales / CNN** | Requieren miles de imágenes mínimo. |
| **Regresión Lineal** | No captura la no-linealidad de la distribución térmica. |
| **Random Forest** | Robusto a ruido, no requiere escalado, y mantiene buen rendimiento con N<30 mediante control de profundidad. |

---

## Técnicas de Extracción de Características (Conteo de Píxeles)

Todas las características se extraen **exclusivamente** por conteo/análisis de
la distribución de intensidades de píxeles, **NO por color**.

### F1 — Conteo en Umbrales Fijos (5 niveles: 50, 100, 130, 150, 180)

Cuenta cuántos píxeles superan cada umbral absoluto de intensidad y
calcula el porcentaje sobre el total. Captura la *"masa térmica"* activa.
El umbral **130** es el más discriminativo (separación de ~77 000 píxeles
entre grupos de 10 g y 50 g en las imágenes de prueba).

### F2 — Conteo por Percentiles Dinámicos (p50, p75, p90, p95)

Usa la distribución de la propia imagen para fijar el umbral, en lugar
de valores absolutos. Robusto al auto-escalado de la cámara térmica:
si la cámara normaliza el histograma, los percentiles se adaptan.

### F3 — Patrones Locales Binarios — LBP (radio=3, puntos=24, uniform)

Recorre cada píxel y compara su intensidad con sus 24 vecinos en un
círculo de radio 3. El histograma de patrones resultante cuantifica la
**textura térmica**: mayor densidad de lombrices produce texturas más complejas
y diversas. Es la feature de mayor correlación con los gramos reales
(**Pearson r ≈ 0.44** en las imágenes de prueba).

---

## Validación: Leave-One-Out Cross-Validation (LOOCV)

Con 26 muestras, LOOCV es la estrategia óptima porque:

- Entrena con 25 muestras y prueba con 1, repitiendo 26 veces.
- Maximiza el uso de datos para entrenamiento (sin desperdiciar muestras).
- Produce la estimación de error más honesta posible con datos escasos.
- K-Fold con K < 26 desperdiciaría datos de entrenamiento innecesariamente.
