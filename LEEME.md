# Vigilancia 24/7

Comprueba tus webs cada 15 minutos desde GitHub (gratis), aunque tu ordenador esté apagado.

- Si una web falla dos comprobaciones seguidas, abre un aviso (issue) en este repositorio: GitHub te lo notifica por correo y en su app del móvil. Se cierra solo cuando la web vuelve.
- Guarda el historial de 7 días en la rama `datos`. El Panel de control lo lee (conector «Vigilancia 24/7») y te enseña la disponibilidad y las caídas que hubo mientras no mirabas.

## Instalación (la hace Antigravity con el flujo `activar-vigilancia-24-7`)
1. Crear un repositorio **público** nuevo en GitHub, p. ej. `vigilancia-webs` (público = minutos gratis ilimitados; solo contiene si tus webs públicas responden).
2. Subir el contenido de esta carpeta (incluida `.github/`).
3. Settings > Actions > General > Workflow permissions: «Read and write permissions».
4. Actions > Vigilancia 24/7 > Run workflow (primera ejecución manual).
5. En la app de GitHub del móvil, activar las notificaciones de este repositorio.
6. En el `.env` del panel: `VIGILANCIA_REPO=tu-usuario/vigilancia-webs`.
