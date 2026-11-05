// Violating client script: contains embedded RSA private key header with FAKE_DATA
export function getSigningCredentials() {
  const privateKey = `-----BEGIN RSA PRIVATE KEY-----
FAKE_DATA`;

  return { privateKey };
}
