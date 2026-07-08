/**
 * Contratos de autenticación — espejo de los DTO del backend (dto/auth).
 *
 * LoginRequest  → body de POST /api/auth/login
 * LoginResponse → respuesta con el JWT y los datos del usuario autenticado
 */

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  rol: string;
}
