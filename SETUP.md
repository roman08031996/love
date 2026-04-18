# 🛠 SETUP — Galería Corazón compartida

Seguí estos pasos **una sola vez** y tu galería quedará lista para que cualquier persona suba y vea fotos.

---

## PASO 1 — Crear cuenta en Supabase (base de datos)

1. Entrá a **https://supabase.com** → clic en **Start your project** → registrate gratis.
2. Creá un nuevo proyecto (elegí un nombre, región: South America si está disponible, o US East).
3. Esperá ~1 minuto a que termine de crear.

### Crear la tabla `photos`

4. En el menú lateral clic en **Table Editor** → **New table**.
5. Configurá la tabla así:
   - **Name:** `photos`
   - **Enable Row Level Security (RLS):** ✅ activado
   - Columnas (las de `id`, `created_at` ya vienen por defecto):

   | Nombre     | Tipo   | Default | Nullable |
   |------------|--------|---------|----------|
   | id         | int8   | autoincrement | NO |
   | created_at | timestamptz | now() | NO |
   | name       | text   | —       | YES |
   | thumb_url  | text   | —       | NO  |
   | orig_url   | text   | —       | NO  |

6. Clic en **Save**.

### Permitir lectura y escritura pública (sin login)

7. En el menú lateral → **Authentication** → **Policies**.
8. Buscá la tabla `photos` → clic en **New Policy** → elegí **"For full customization"**.
9. Creá **dos políticas**:

   **Política 1 — Lectura:**
   - Policy name: `allow_read`
   - Allowed operation: `SELECT`
   - USING expression: `true`

   **Política 2 — Escritura:**
   - Policy name: `allow_insert`
   - Allowed operation: `INSERT`
   - WITH CHECK expression: `true`

   **Política 3 — Borrado:**
   - Policy name: `allow_delete`
   - Allowed operation: `DELETE`
   - USING expression: `true`

### Obtener tus credenciales de Supabase

10. Menú lateral → **Project Settings** → **API**.
11. Copiá:
    - **Project URL** → esto es tu `SUPABASE_URL`
    - **anon / public key** → esto es tu `SUPABASE_ANON_KEY`

---

## PASO 2 — Crear cuenta en Cloudinary (almacenamiento de imágenes)

1. Entrá a **https://cloudinary.com** → **Sign up for free**.
2. Una vez dentro, en el **Dashboard** anotá tu **Cloud name** (ej: `mi-galeria-abc`).

### Crear un Upload Preset sin firma (unsigned)

3. Menú superior → **Settings** → **Upload** → sección **Upload presets**.
4. Clic en **Add upload preset**.
5. Configurá:
   - **Upload preset name:** `galeria_corazon` (o el nombre que quieras)
   - **Signing mode:** `Unsigned` ⚠ **MUY IMPORTANTE**
   - **Folder:** `galeria-corazon`
6. Clic en **Save**.

---

## PASO 3 — Completar las credenciales en `script.js`

Abrí el archivo `script.js` y reemplazá las 4 variables al inicio:

```javascript
const CONFIG = {
  CLOUDINARY_CLOUD_NAME:    'mi-galeria-abc',         // tu Cloud name
  CLOUDINARY_UPLOAD_PRESET: 'galeria_corazon',        // tu preset
  SUPABASE_URL:             'https://abcde.supabase.co', // tu Project URL
  SUPABASE_ANON_KEY:        'eyJhbGc...',             // tu anon key
  // (el resto no lo toques)
};
```

---

## PASO 4 — Subir los cambios a GitHub

```bash
git add script.js
git commit -m "Galería compartida con Cloudinary + Supabase"
git push
```

GitHub Pages se actualiza automáticamente en ~1 minuto.

---

## ✅ Listo

- Cualquier persona que entre al sitio puede **ver** todas las fotos.
- Cualquier persona puede **subir** nuevas fotos.
- Las fotos quedan guardadas permanentemente en la nube.

---

## 🔒 Seguridad (opcional pero recomendado)

Por defecto cualquiera puede también **borrar** fotos. Si querés proteger el borrado:
- En Supabase, eliminá la **Política 3 (allow_delete)**.
- En ese caso, solo vos (desde el panel de Supabase) podés borrar fotos.

---

## ❓ Problemas frecuentes

| Error | Causa | Solución |
|-------|-------|----------|
| `Failed to fetch` al subir | Credenciales incorrectas | Verificá SUPABASE_URL y ANON_KEY |
| `Upload preset not found` | Nombre de preset incorrecto | Verificá exactamente el nombre en Cloudinary |
| Las fotos no se ven | CORS de Cloudinary | El folder debe ser `galeria-corazon` (con guiones) |
| La galería aparece vacía | RLS sin políticas | Verificá que creaste la política `allow_read` |
