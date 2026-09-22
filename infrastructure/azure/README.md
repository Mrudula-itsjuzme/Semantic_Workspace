# Azure Deployment (Docker Compose on a single VM)

The project deliberately avoids Kubernetes. One Ubuntu VM running Docker
Compose (base + prod override) is sufficient for this platform.

## 1. Provision

```bash
az group create --name srw-rg --location westeurope
az vm create \
  --resource-group srw-rg \
  --name srw-vm \
  --image Ubuntu2204 \
  --size Standard_D4s_v3 \
  --admin-username azureuser \
  --generate-ssh-keys
az vm open-port --resource-group srw-rg --name srw-vm --port 80,443 --priority 100
```

## 2. Install Docker & deploy

```bash
ssh azureuser@<VM_PUBLIC_IP>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
git clone <your-repo> srw && cd srw
cp .env.example .env       # fill real secrets — never commit this file
mkdir -p infrastructure/nginx/certs
# install TLS certs (see infrastructure/nginx/README.md)
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/docker-compose.prod.yml up -d
```

## 3. Secrets

Store secrets in Azure Key Vault and inject at deploy time, or keep them
only in the VM's `/opt/srw/.env` (chmod 600). Never bake secrets into
images or commit them.

## 4. Persistent storage (built-in)

All state lives in named Docker volumes (`postgres_data`, `redis_data`,
`minio_data`, `neo4j_data`) — they survive redeploys. For Azure-managed
disks, attach a data disk and relocate `/var/lib/docker/volumes`.

## 5. Restart / recovery

Every service has `restart: always` (prod). After a VM reboot Docker
restarts the stack automatically. To rebuild after a code update:

```bash
git pull
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/docker-compose.prod.yml build
docker compose -f infrastructure/docker-compose.yml \
               -f infrastructure/docker-compose.prod.yml up -d
```

## 6. Backup

```bash
# Postgres (logical, consistent)
docker exec srw_postgres pg_dump -U postgres semantic_workspace | gzip > backup_$(date +%F).sql.gz

# MinIO objects
docker run --rm --network srw_default -v srw_minio_data:/data -v $PWD:/backup \
  alpine tar czf /backup/minio_$(date +%F).tar.gz /data

# Neo4j (stop writes first or use neo4j-admin dump in a sidecar)
docker exec srw_neo4j neo4j-admin database dump neo4j --to-stdout > neo4j_$(date +%F).dump
```

Schedule with cron on the VM and copy to Azure Blob:

```bash
az storage blob upload-batch -d srw-backups -s . --pattern "backup_*.gz"
```

## 7. Restore

```bash
gunzip -c backup_2026-09-22.sql.gz | docker exec -i srw_postgres psql -U postgres -d semantic_workspace
docker run --rm -v srw_minio_data:/data -v $PWD:/backup alpine \
  sh -c "cd / && tar xzf /backup/minio_2026-09-22.tar.gz"
docker exec -i srw_neo4j neo4j-admin database load neo4j --from-stdin
```

## 8. Health & monitoring

- `https://<host>/health` — aggregate component health
- `https://<host>/metrics` — Prometheus scrape (internal networks only)
- `docker compose ps`, `docker logs srw_backend` for triage
