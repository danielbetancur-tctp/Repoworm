# Predicción de Densidad y Cantidad de Lombrices Rojas 🪱

Aplicación web para la **estimación automática de la densidad y cantidad de lombrices rojas
(_Eisenia fetida_)** a partir de **imágenes térmicas** y modelos de **inteligencia artificial**
(CatBoost / Random Forest en formato ONNX).

Cada imagen térmica pasa por un **módulo de preprocesamiento en Python** (OpenCV / scikit-image)
que la limpia —recorte, remoción de artefactos del visor— y extrae las **características térmicas**
que alimentan al modelo antes de la inferencia. Este pipeline se aplica tanto a los modelos
integrados como a los **modelos `.onnx` personalizados** que suba el usuario.

Proyecto de investigación de la **Institución Universitaria de Envigado (IUE)** en colaboración
con la **Universidad de Antioquia (UdeA)**.

---

## Tabla de contenido

- [Arquitectura](#-arquitectura)
- [Cómo funciona la predicción](#-cómo-funciona-la-predicción)
- [Requisitos previos](#-requisitos-previos)
- [Instalación](#-instalación)
- [Ejecución (un solo comando)](#-ejecución-un-solo-comando)
- [Otros comandos](#-otros-comandos)
- [Uso de la aplicación](#-uso-de-la-aplicación)
- [Modelos de IA](#-modelos-de-ia)
- [Configuración](#-configuración)
- [Compilar para producción](#-compilar-para-producción)
- [Solución de problemas](#-solución-de-problemas)
- [Stack tecnológico](#-stack-tecnológico)

---

## Arquitectura

```
Aplicativo/
├── package.json          ← orquestador raíz (ejecuta ambos con un comando)
├── README.md
├── backend/              ← API REST (Node + Express + TypeScript)
│   ├── src/
│   │   ├── app.ts                 → punto de entrada del servidor
│   │   ├── routes/                → rutas de la API
│   │   ├── controllers/           → controladores
│   │   ├── services/              → inferencia ONNX, extracción de features y puente a Python
│   │   ├── middleware/            → subida de archivos y manejo de errores
│   │   └── types/                 → interfaces compartidas
│   ├── python/                    → módulo de preprocesamiento (Python)
│   │   ├── preprocesamiento.py        → limpieza y extracción de características térmicas
│   │   ├── extract_features_cli.py    → CLI: imagen → vector de características (predicción)
│   │   ├── preprocess_image_cli.py    → CLI: imagen → imagen limpia (base64)
│   │   └── requirements.txt           → dependencias Python
│   └── ModelosEntrenado/          → modelos .onnx integrados
└── frontend/             ← SPA (Angular 17 + Angular Material)
    └── src/app/
        ├── core/                  → servicios y modelos
        └── features/predictor/    → pantalla principal y componentes
```

- **Frontend** → `http://localhost:4200`
- **Backend** → `http://localhost:3000` (API bajo `/api`)

El frontend consume la API del backend; ambos se comunican por HTTP con CORS habilitado.
El backend, a su vez, invoca el módulo de preprocesamiento en **Python** mediante procesos hijo
para limpiar la imagen y extraer las características que consume el modelo ONNX.

### Endpoints de la API

| Método | Ruta               | Descripción                                                        |
|--------|--------------------|--------------------------------------------------------------------|
| `GET`  | `/api/health`      | Estado del servidor (health check).                                |
| `GET`  | `/api/models`      | Lista los modelos `.onnx` integrados disponibles.                  |
| `POST` | `/api/predict`     | Ejecuta el preprocesamiento + inferencia y devuelve la predicción. |
| `POST` | `/api/preprocess`  | Devuelve la imagen térmica limpia (base64) sin ejecutar inferencia.|

---

## Cómo funciona la predicción

Al pulsar **Ejecutar Predicción**, el backend realiza estos pasos:

1. **Recibe** la imagen térmica y, opcionalmente, un modelo `.onnx` personalizado y las variables tabulares.
2. **Preprocesa la imagen** con el módulo Python: recorte de la interfaz FLIR, remoción de artefactos
   (cruz roja, corchetes del visor) y extracción de las características térmicas.
3. **Lee la forma de entrada del modelo** directamente de los metadatos del `.onnx`, por lo que se
   adapta a **cualquier número de características** (no depende del nombre del archivo).
4. **Construye el tensor** con las variables ambientales + las características térmicas, ajustado a la
   dimensión que el modelo espera, y **ejecuta la inferencia**.
5. **Devuelve** la predicción (gramos, densidad, cantidad estimada) y, si ingresaste un dato real, las
   métricas de comparación.

> ⚠️ **Importante:** como la predicción ejecuta el módulo de preprocesamiento en Python, **el entorno
> de Python y sus dependencias deben estar instalados** (ver [Requisitos previos](#-requisitos-previos)).
> Si el preprocesamiento no puede ejecutarse, la predicción falla con un mensaje claro en lugar de
> devolver un resultado con datos sin procesar.

---

##  Requisitos previos

| Herramienta | Versión recomendada | Necesaria para                                  |
|-------------|---------------------|-------------------------------------------------|
| **Node.js** | 18 o superior       | Backend (API) y frontend (Angular)              |
| **npm**     | 9 o superior        | Gestión de dependencias                         |
| **Python**  | 3.9 o superior      | Módulo de preprocesamiento (requerido para predecir) |

Verifica tu instalación:

```bash
node -v
npm -v
python --version
```

> El backend invoca Python con el comando `python` (Windows) o `python3` (Linux/macOS). Si tu
> ejecutable tiene otro nombre o ruta, configúralo con la variable `PYTHON_BIN`
> (ver [Configuración](#-configuración)).

---

##  Instalación

**1. Dependencias de Node** — desde la carpeta raíz (`Aplicativo/`), instala **todas** (raíz + backend
+ frontend) con un solo comando:

```bash
npm run install:all
```

> Esto instala `concurrently` en la raíz y luego las dependencias de `backend/` y `frontend/`.
> Solo es necesario ejecutarlo la primera vez (o cuando cambien las dependencias).

**2. Dependencias de Python** — instala las librerías del módulo de preprocesamiento:

```bash
python -m pip install -r backend/python/requirements.txt
```

> Incluye `opencv-python`, `numpy`, `pandas`, `scipy` y `scikit-image`. Son **obligatorias** para
> ejecutar predicciones. (Opcional pero recomendado: usar un entorno virtual de Python.)

---

##  Ejecución (un solo comando)

Desde la carpeta raíz (`Aplicativo/`):

```bash
npm run dev
```

Esto levanta **backend y frontend a la vez** con recarga automática:

-  `BACKEND`  → `http://localhost:3000`
-  `FRONTEND` → `http://localhost:4200`

Abre el navegador en **http://localhost:4200**.

Para detener ambos procesos: **Ctrl + C** en la terminal.

---

##  Otros comandos

Todos se ejecutan desde la carpeta raíz (`Aplicativo/`):

| Comando                 | Descripción                                              |
|-------------------------|----------------------------------------------------------|
| `npm run dev`           | Ejecuta backend + frontend juntos (desarrollo)           |
| `npm run backend`       | Ejecuta **solo** el backend                              |
| `npm run frontend`      | Ejecuta **solo** el frontend                             |
| `npm run install:all`   | Instala dependencias de raíz, backend y frontend         |
| `npm run build`         | Compila backend y frontend (desarrollo)                  |
| `npm run build:prod`    | Compila backend y frontend para **producción**           |

---

##  Uso de la aplicación

La aplicación tiene 4 secciones (pestañas): **Probar Modelo**, **Resultados**, **Contexto** y **Acerca de**.

### 1. Probar Modelo

1. **Modelo** — elige un **modelo integrado** del desplegable **o** sube tu propio modelo
   **`.onnx`** (máx. 50 MB). Si subes uno personalizado, tiene prioridad sobre el integrado.
2. **Imagen** _(obligatorio)_ — arrastra o selecciona una imagen térmica
   (JPG, PNG, JPEG, TIFF, BMP · máx. 10 MB). Verás la vista previa al lado.
3. **Data tabular** _(opcional)_ — de forma opcional puedes:
   - Subir un **archivo Excel** (`.xlsx`) y las variables se rellenan solas, **o**
   - Ingresar las variables ambientales manualmente (humedad, temperatura, pH, etc.), **y/o**
   - Ingresar el **dato real (g)** (opcional) para comparar contra la predicción.
4. Pulsa **Ejecutar Predicción**.

### 2. Resultados

Tras ejecutar la predicción se muestra:

- **Tarjetas (KPIs):** Cantidad estimada (g), Densidad estimada y Modelo utilizado.
- **Gráficas comparativas** (solo si ingresaste un **dato real**):
  - **Regresión lineal: Predicción vs Dato real** — predicho vs. real (g) sobre la línea ideal `y = x`.
  - **Comparación: Estimado vs Real (g)** — barras con la diferencia en gramos.

> Si **no** ingresas un dato real, las gráficas comparativas se ocultan (no hay con qué comparar).

---

##  Modelos de IA

- Los modelos **integrados** son archivos `.onnx` ubicados en:
  ```
  backend/ModelosEntrenado/
  ```
  El backend los detecta automáticamente y los expone en el desplegable de la app.
  Para añadir un modelo, copia su archivo `.onnx` en esa carpeta y reinicia el backend.

- También puedes **subir un modelo `.onnx` propio** desde la interfaz sin tocar el servidor. Tiene
  prioridad sobre el modelo integrado seleccionado.

- El backend **lee de los metadatos del modelo** cuántas características espera y ajusta la entrada a
  esa dimensión, por lo que admite modelos con **distinto número de características** (p. ej. Random
  Forest ≈ 40, CatBoost ≈ 71, u otros). El requisito es que el modelo reciba un **vector numérico
  plano** `[lote, N]` en `float32` (regresores tipo scikit-learn / CatBoost / XGBoost exportados a
  ONNX). Modelos que esperan una imagen 4D (tipo CNN) no encajan en este flujo y devuelven un error claro.

> **Nota:** los indicadores de la sección Resultados (cantidad y comparación con el dato real)
> se calculan **realmente** a partir de la inferencia del `.onnx` y del dato real
> que ingreses. No hay valores de ejemplo/placeholder.

> **Sobre la correctitud:** para que la predicción de un modelo personalizado sea exacta, este debe
> esperar sus características en el **mismo orden** con el que fue entrenado (idealmente, entrenado con
> este mismo preprocesamiento). Si el orden difiere, el modelo se ejecuta igualmente pero el resultado
> puede no ser fiable.

---

##  Configuración

### Frontend — URL de la API

`frontend/src/environments/environment.ts`

```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
};
```

### Backend — puerto y CORS (variables de entorno opcionales)

| Variable             | Valor por defecto              | Descripción                                                    |
|----------------------|--------------------------------|----------------------------------------------------------------|
| `PORT`               | `3000`                         | Puerto del servidor de la API                                  |
| `CORS_ORIGIN`        | `http://localhost:4200`        | Origen(es) permitido(s) para CORS. Admite varios separados por coma. |
| `PYTHON_BIN`         | `python` (Win) / `python3`     | Ejecutable de Python usado para el preprocesamiento            |
| `PYTHON_TIMEOUT_MS`  | `30000`                        | Tiempo máximo (ms) de los procesos de preprocesamiento         |

> **CORS:** además de los orígenes de `CORS_ORIGIN`, en desarrollo se permite automáticamente
> cualquier `localhost` o `127.0.0.1` en **cualquier puerto**. Así, abrir la app por
> `http://localhost:4200` o `http://127.0.0.1:4200` funciona sin configuración adicional.

Ejemplo:

```bash
# Windows (PowerShell)
$env:PORT="4000"; npm run backend

# Linux / macOS
PORT=4000 npm run backend
```

> Si cambias el puerto del backend, actualiza también `apiUrl` en `environment.ts`.

### Límites de subida

| Archivo               | Formato                          | Tamaño máximo |
|-----------------------|----------------------------------|---------------|
| Imagen térmica        | JPG, PNG, JPEG, TIFF, BMP        | 10 MB         |
| Modelo personalizado  | `.onnx`                          | 50 MB         |
| Data tabular          | `.xlsx`                          | 10 MB         |

---

##  Compilar para producción

```bash
npm run build:prod
```

- Backend → se compila a `backend/dist/` (arráncalo con `npm --prefix ./backend start`).
- Frontend → se genera en `frontend/dist/frontend/` (sírvelo con cualquier servidor de estáticos).

> El servidor de producción también necesita **Python y sus dependencias** instalados (el
> preprocesamiento se ejecuta en cada predicción). El paso `build:prod` no compila el módulo Python:
> asegúrate de instalar `backend/python/requirements.txt` en el entorno de despliegue.

---

##  Solución de problemas

| Problema | Causa / Solución |
|----------|------------------|
| **"No se puede conectar al servidor"** en la app | El backend no está corriendo (ejecuta `npm run dev` / `npm run backend` y verifica `http://localhost:3000/api/health`) **o** abriste el frontend desde un origen no permitido por CORS. La app admite `localhost` y `127.0.0.1`; para otro host/puerto define `CORS_ORIGIN`. |
| **La predicción falla o no encuentra Python** | Instala las dependencias de Python (`python -m pip install -r backend/python/requirements.txt`) y confirma que `python --version` funciona. Si tu ejecutable tiene otro nombre, define `PYTHON_BIN`. |
| **La predicción tarda varios segundos** | Es esperado: cada predicción ejecuta el preprocesamiento en Python (~2–5 s según el tamaño de la imagen). |
| **"El puerto 4200/3000 ya está en uso"** | Ya hay una instancia corriendo. Ciérrala (Ctrl + C) o mata el proceso que ocupa el puerto antes de volver a ejecutar. |
| **Los cambios no se ven en el navegador** | Recarga forzada con **Ctrl + F5**. Si instalaste una dependencia nueva, reinicia `npm run dev`. |
| **`concurrently` no se encuentra** | Ejecuta `npm run install:all` (instala las dependencias de la raíz). |
| **El desplegable de modelos aparece vacío** | Verifica que existan archivos `.onnx` en `backend/ModelosEntrenado/`. |
| **El modelo `.onnx` devuelve un error de forma de tensor** | El modelo espera una entrada 4D (tipo CNN) o de tipo distinto a `float32`. Este flujo admite vectores planos `[lote, N]` en `float32`. |

Comprobación rápida de que el backend está vivo:

```bash
curl http://localhost:3000/api/health
# → {"status":"ok", ...}
```

---

##  Stack tecnológico

**Frontend**
- Angular 17 (standalone components + signals)
- Angular Material
- Chart.js (gráficas)
- SheetJS `xlsx` (lectura de archivos Excel)

**Backend**
- Node.js + Express + TypeScript
- `onnxruntime-node` (inferencia de modelos ONNX)
- `multer` (subida de archivos)
- `helmet`, `cors`, `morgan` (seguridad y logging)

**Preprocesamiento (Python)**
- Python 3.9+
- OpenCV (`opencv-python`) y NumPy — limpieza de imagen
- pandas, SciPy y scikit-image — extracción de características térmicas (GLCM, LBP, percentiles)

---

##  Créditos

Proyecto de investigación desarrollado por la **Institución Universitaria de Envigado (IUE)**
en alianza con la **Universidad de Antioquia (UdeA)**, en el marco de la lombricultura sostenible
y la agricultura de precisión.
