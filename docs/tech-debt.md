# Tech debt

- `infra-bootstrap/` são scripts bash — sem testes, sem idempotência
  garantida
- `docs/deploy/*` referenciam `bin/dev-stack` que foi removido
