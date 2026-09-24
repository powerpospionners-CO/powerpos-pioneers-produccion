export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error(
      'JWT_SECRET es obligatorio. Configure una clave privada antes de iniciar la API.',
    );
  }
  return secret;
}
