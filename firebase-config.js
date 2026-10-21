// firebase-config.js
// Las credenciales de Firebase están cifradas con AES-256-GCM.
// No hay texto plano en el repositorio. Se descifran en el navegador
// solo cuando se ingresa la contraseña secreta correcta.
const ENCRYPTED_FIREBASE_PAYLOAD = {
  iv: "4OQIVeNJR4Qn3amj",
  data: "74hntZnSTyhSAHnulUeuA9fuggjEpSbT0KJvW0So8Q2ZWpadIWf4g8ol9ALnVW26laGOtboc5raeFXQ6hs0pcjCJHHf0DboP1PazFCnqsqGgJnzQ92bjN17uwBFvQyCwB1GlHBBSQsJrh5pBdA36A7hwzpiLjfmZ80Ncmg92hq+5GogWN73HEBaYJKztteDiOX5lBdI4AYEAoTadDz1us25YiGZ1pQFrFihmarwptht2L+ppKIjx6+o5N7vVVOZTYopQH/s5VC29TDLGnZeqt7LeOjrvi5ExOWlVDN8GghNS4BxV/ANtQRu1nFbkaIpiAwuzlD+aCM9uZFMQW4lfV48krVl6EL3S1Fp7N+dhfwq6JBYEB6vnPRXgdxhLGCaj8NEvQM7mUpWy7Wsc5GAWllemFrif5lo3NLqn/J5egP/ZErqhuPoQKLNVENtantzfF3w="
};

const CRYPTO_SALT = 'uno_pareja_salt_2026';
let _activeFirebaseConfig = null;

async function unlockFirebaseWithPassword(password) {
  try {
    const saltBuffer = new TextEncoder().encode(CRYPTO_SALT);
    const passKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password.trim()),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    const aesKey = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBuffer, iterations: 100000, hash: 'SHA-256' },
      passKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const rawIv = Uint8Array.from(atob(ENCRYPTED_FIREBASE_PAYLOAD.iv), c => c.charCodeAt(0));
    const rawData = Uint8Array.from(atob(ENCRYPTED_FIREBASE_PAYLOAD.data), c => c.charCodeAt(0));
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rawIv }, aesKey, rawData);
    const jsonStr = new TextDecoder().decode(decrypted);
    _activeFirebaseConfig = JSON.parse(jsonStr);
    localStorage.setItem("uno_cached_config", jsonStr);
    return _activeFirebaseConfig;
  } catch (err) {
    console.error("Error al descifrar Firebase:", err);
    return null;
  }
}

function getSavedFirebaseConfig() {
  if (_activeFirebaseConfig) return _activeFirebaseConfig;
  const cached = localStorage.getItem("uno_cached_config");
  if (cached) {
    try {
      _activeFirebaseConfig = JSON.parse(cached);
      return _activeFirebaseConfig;
    } catch (e) {
      console.warn("Cache inválido:", e);
    }
  }
  return null;
}

// FIX: faltaba esta función (la usa el botón "Guardar Credenciales")
function saveFirebaseConfig(config) {
  _activeFirebaseConfig = config;
  localStorage.setItem("uno_cached_config", JSON.stringify(config));
}

window.FirebaseManager = {
  unlock: unlockFirebaseWithPassword,
  getSavedConfig: getSavedFirebaseConfig,
  saveConfig: saveFirebaseConfig
};
