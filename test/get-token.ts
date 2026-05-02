export function getToken(): string {
  const token = process.env.GOOGLE_ACCESS_TOKEN;

  if (!token)
    throw new Error("Google Access Token not found in environment file!");

  return token;
}
