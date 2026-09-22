# TLS certificates

Place your certificate chain and key here:

```
infrastructure/nginx/certs/fullchain.pem
infrastructure/nginx/certs/privkey.pem
```

## Development (self-signed)

```bash
mkdir -p infrastructure/nginx/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/nginx/certs/privkey.pem \
  -out infrastructure/nginx/certs/fullchain.pem \
  -subj "/CN=localhost"
```

## Production

Use Azure Key Vault-managed certificates or Let's Encrypt (certbot). Copy
the resulting `fullchain.pem` and `privkey.pem` into this directory (or
mount them from a secret store). Never commit certificates to git.
