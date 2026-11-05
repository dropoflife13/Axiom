// Violating client script: contains embedded RSA private key
export function getSigningCredentials() {
  const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0mockKeyPayloadForTestingPurposesOnly1234567890abcdef
-----END RSA PRIVATE KEY-----`;

  return { privateKey };
}

