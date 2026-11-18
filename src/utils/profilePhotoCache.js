const PREFIX = 'hechi-profile-photo:';

function key(token, username) {
  const classToken = token?.trim().toUpperCase();
  const name = username?.trim().toLocaleLowerCase('es');
  return classToken && name ? `${PREFIX}${classToken}:${name}` : null;
}

export function readProfilePhoto(token, username) {
  const storageKey = key(token, username);
  if (!storageKey) return null;
  try {
    const photo = localStorage.getItem(storageKey);
    return photo?.startsWith('data:image/jpeg;base64,') ? photo : null;
  } catch { return null; }
}

export function saveProfilePhoto(token, username, photo) {
  const storageKey = key(token, username);
  if (!storageKey || !photo?.startsWith('data:image/jpeg;base64,')) return;
  try { localStorage.setItem(storageKey, photo); } catch { /* Login still works when storage is full. */ }
}

export function moveProfilePhoto(token, oldUsername, newUsername) {
  const photo = readProfilePhoto(token, oldUsername);
  if (!photo) return;
  saveProfilePhoto(token, newUsername, photo);
  try { localStorage.removeItem(key(token, oldUsername)); } catch { /* Cache is optional. */ }
}
