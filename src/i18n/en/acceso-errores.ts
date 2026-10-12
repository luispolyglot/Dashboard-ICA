// Zona: pantallas de entrada y contraseña (errores de Supabase en el idioma de la app y fin del
// cambio de contraseña) (9 Oct 2026).
// Llave = texto en español EXACTO (igual que en t()); valor = inglés.
const en: Record<string, string> = {
  "El correo y la contraseña no coinciden.": "The email and password don't match.",
  "Antes de entrar, confirma tu correo con el enlace que te enviamos.": "Before signing in, confirm your email with the link we sent you.",
  "La nueva contraseña tiene que ser distinta de la anterior.": "Your new password must be different from the old one.",
  "Ya hay una cuenta con este correo.": "There's already an account with this email.",
  "Demasiados intentos seguidos. Espera un momento y vuelve a probar.": "Too many attempts in a row. Wait a moment and try again.",
  "No hay conexión. Revisa tu internet y vuelve a probar.": "No connection. Check your internet and try again.",
  "Contraseña cambiada": "Password changed",
  "Ya puedes entrar con tu nueva contraseña.": "You can now sign in with your new password.",
  "Tu contraseña se ha cambiado.": "Your password has been changed.",
  "Entra de nuevo con tu correo y tu nueva contraseña.": "Sign in again with your email and your new password.",
}
export default en
