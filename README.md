## 🎴 UNO! Virtual: Tú & Yo (Privado & 100% Gratis)

Juego de **UNO! online para 2 personas** con reglas oficiales de 2 jugadores, animaciones, avatares y **pantalla de acceso privado con clave secreta**.

### 🔒 Privacidad
- La contraseña **no** está en el código: se valida con un hash SHA-256 con salt.
- Las credenciales de Firebase están cifradas (AES-256-GCM) y solo se descifran con la clave correcta.
- ⚠️ **Nunca escribas la contraseña en este README ni en comentarios del código** si el repositorio es público.

### 🚀 Publicar en GitHub Pages
1. Crea un repositorio en [github.com/new](https://github.com/new) (por ejemplo `uno-tu-y-yo`) en **Public**.
2. Sube los archivos:
   ```
   git init
   git add .
   git commit -m "UNO Tú & Yo"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/uno-tu-y-yo.git
   git push -u origin main
   ```
3. En el repo: **Settings → Pages → Branch: main → Save**.
4. En 1–2 minutos tendrás tu enlace: `https://TU-USUARIO.github.io/uno-tu-y-yo/`

### 🔥 Reglas de Firebase (obligatorio)
En Firebase Console → **Realtime Database → Reglas**, pega el contenido de `database.rules.json` y pulsa **Publicar**.
Si la base se creó en "modo de prueba", las reglas caducan a los 30 días y el juego deja de conectar.

### 💖 Cómo jugar
1. Ambos abren el enlace e ingresan la contraseña secreta (solo la primera vez).
2. Cada uno elige su avatar y nombre.
3. Uno pulsa **Crear Nueva Partida** y envía el enlace por WhatsApp.
4. La otra persona abre el enlace y pulsa **Unirme a una Sala Existente**.
5. Quien creó la sala pulsa **Comenzar Juego**.

> Si cambiaste de navegador o borraste datos, tendrás que volver a ingresar la contraseña.
