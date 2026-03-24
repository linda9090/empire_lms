# Empire LMS 배포 가이드

이 문서는 Empire LMS 서비스를 설치하고 실행하는 방법을 안내합니다.

## 목차

1. [시스템 요구사항](#시스템-요구사항)
2. [빠른 시작](#빠른-시작)
3. [서비스 관리 스크립트](#서비스-관리-스크립트)
4. [개발 환경 설정](#개발-환경-설정)
5. [프로덕션 환경 설정](#프로덕션-환경-설정)
6. [데이터베이스 관리](#데이터베이스-관리)
   - [옵션 1: Docker PostgreSQL](#옵션-1-docker로-postgresql-실행-권장)
   - [옵션 2: 네이티브 PostgreSQL](#옵션-2-네이티브-postgresql-설치)
7. [문제 해결](#문제-해결)

---

## 시스템 요구사항

### 필수 구성요소

| 구성요소 | 최소 버전 | 권장 버전 |
|---------|-----------|-----------|
| Node.js | 20.x | 20.x LTS |
| npm | 9.x | 최신 버전 |
| PostgreSQL | 14.x | 16.x |
| 메모리 | 2GB | 4GB+ |
| 디스크 | 1GB | 5GB+ |

### 운영체제

- Linux (Ubuntu 20.04+, Debian 11+)
- macOS 12+
- Windows 10+ (WSL2 권장)

---

## 빠른 시작

### 1. 리포지토리 클론

```bash
git clone https://github.com/linda9090/empire_lms.git
cd empire_lms
```

### 2. 스크립트 실행 권한 부여

```bash
chmod +x empire_lms.sh
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
nano .env  # 또는 vi .env
```

### 4. 서비스 시작

```bash
./empire_lms.sh start
```

서비스가 http://localhost:3000 에서 시작됩니다.

---

## 서비스 관리 스크립트

`empire_lms.sh` 스크립트는 서비스의 시작, 중지, 재시작, 상태 확인을 관리합니다.

### 명령어 형식

```bash
./empire_lms.sh <command> [mode]
```

### 사용 가능한 명령어

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `start [dev\|prod]` | 서비스 시작 | `./empire_lms.sh start` |
| `stop` | 서비스 중지 | `./empire_lms.sh stop` |
| `restart [dev\|prod]` | 서비스 재시작 | `./empire_lms.sh restart` |
| `status` | 서비스 상태 확인 | `./empire_lms.sh status` |
| `logs [n]` | 로그 보기 | `./empire_lms.sh logs` |

### 사용 예제

```bash
# 개발 모드로 시작 (기본값)
./empire_lms.sh start

# 프로덕션 모드로 시작
./empire_lms.sh start prod

# 서비스 중지
./empire_lms.sh stop

# 개발 모드로 재시작
./empire_lms.sh restart

# 상태 확인
./empire_lms.sh status

# 마지막 50줄의 로그 확인
./empire_lms.sh logs 50

# 실시간 로그 추적
./empire_lms.sh logs
```

### 상태 출력 예시

```
==========================================
  Empire LMS Service Status
==========================================

Status: Running
PID: 12345

Process Details:
PID   PPID  CMD                         ELAPSED  STAT
12345 12340  node ./node_modules/next/  00:05:23 S+

Port Usage:
COMMAND   PID  USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
node    12345 user   22u  IPv4  12345      0t0  TCP *:3000 (LISTEN)

Recent Logs:
----------------------------------------
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
event: compiled client and server successfully
```

---

## 개발 환경 설정

### 1. 의존성 설치

```bash
npm install
```

### 2. 환경 변수 구성

`.env` 파일을 생성하고 필요한 변수를 설정합니다:

```bash
# 데이터베이스 (Docker PostgreSQL 사용 시 포트 5434)
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/empire_lms"

# 또는 네이티브 PostgreSQL 사용 시 (포트 5432)
# DATABASE_URL="postgresql://user:password@localhost:5432/empire_lms"

# 인증 (최소 32자)
BETTER_AUTH_SECRET="your-secret-key-minimum-32-characters-long"

# 애플리케이션 URL
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# 결제 모드 (mock/stripe/paypal)
PAYMENT_MODE="mock"

# Socket.io (선택사항)
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

### 3. 데이터베이스 마이그레이션

```bash
# Prisma 클라이언트 생성
npx prisma generate

# 데이터베이스 마이그레이션 실행
npx prisma migrate dev --name init

# 또는 개발용으로 스키마 동기화 (데이터 초기화)
npx prisma db push
```

### 4. 개발 서버 시작

```bash
./empire_lms.sh start dev
```

또는 직접 실행:

```bash
npm run dev
```

### 개발용 추가 스크립트

```bash
# 테스트 실행
npm run test

# 테스트 감시 모드
npm run test:watch

# 테스트 커버리지
npm run test:coverage

# Linting
npm run lint
```

---

## 프로덕션 환경 설정

### 1. 빌드

```bash
npm run build
```

### 2. 환경 변수 구성

프로덕션용 `.env` 파일:

```bash
# 데이터베이스 (프로덕션 DB 사용)
DATABASE_URL="postgresql://user:password@prod-host:5432/empire_lms"

# 인증 (강력한 비밀키 사용)
BETTER_AUTH_SECRET="use-a-strong-random-64-character-secret-key"

# 애플리케이션 URL (실제 도메인)
NEXT_PUBLIC_APP_URL="https://your-domain.com"

# 결제 설정
PAYMENT_MODE="stripe"
STRIPE_SECRET_KEY="sk_live_your_stripe_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"

# 또는 PayPal
# PAYMENT_MODE="paypal"
# PAYPAL_CLIENT_ID="your_paypal_client_id"
# PAYPAL_CLIENT_SECRET="your_paypal_client_secret"

# 파일 업로드
UPLOADTHING_SECRET="your_uploadthing_secret"

# Socket.io
NEXT_PUBLIC_SOCKET_URL="https://your-socket-server.com"
```

### 3. 프로덕션 서버 시작

```bash
./empire_lms.sh start prod
```

또는 직접 실행:

```bash
npm run build
npm run start
```

### 4. PM2를 사용한 프로세스 관리 (권장)

PM2를 설치하고 사용하면 더 안정적인 프로덕션 운영이 가능합니다:

```bash
# PM2 설치
npm install -g pm2

#生态系统 파일 생성
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'empire-lms',
    script: 'node_modules/next/dist/bin/next',
    args: 'start',
    instances: 1,
    exec_mode: 'cluster',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true
  }]
};
EOF

# PM2로 시작
pm2 start ecosystem.config.js

# 상태 확인
pm2 status

# 로그 확인
pm2 logs empire-lms

# 재시작
pm2 restart empire-lms

# 중지
pm2 stop empire-lms

# 시스템 부팅시 자동 시작
pm2 startup
pm2 save
```

### 5. Nginx 리버스 프록시 설정 (선택사항)

```nginx
# /etc/nginx/sites-available/empire-lms
server {
    listen 80;
    server_name your-domain.com;

    # Let's Encrypt SSL 인증서 사용 시
    # listen 443 ssl http2;
    # ssl_certificate /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 타임아웃 설정
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 정적 파일 캐싱
    location /_next/static {
        proxy_pass http://localhost:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 데이터베이스 관리

### 옵션 1: Docker로 PostgreSQL 실행 (권장)

Docker를 사용하면 기존 PostgreSQL과 충돌 없이 격리된 환경에서 실행할 수 있습니다.

#### Docker 컨테이너로 PostgreSQL 시작

```bash
# empire_pg 컨테이너 생성 및 시작
docker run -d \
  --name empire_pg \
  --restart unless-stopped \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=empire_lms \
  -p 5434:5432 \
  postgres:16-alpine

# 컨테이너 상태 확인
docker ps | grep empire_pg

# 로그 확인
docker logs empire_pg
```

#### 환경 변수 설정

`.env` 파일에 Docker PostgreSQL 연결 정보를 설정합니다:

```bash
# Docker PostgreSQL (포트 5434 사용)
DATABASE_URL="postgresql://postgres:postgres@localhost:5434/empire_lms"
```

#### Docker 컨테이너 관리

```bash
# 컨테이너 중지
docker stop empire_pg

# 컨테이너 시작
docker start empire_pg

# 컨테이너 재시작
docker restart empire_pg

# 컨테이너 삭제 (데이터 삭제 주의)
docker stop empire_pg
docker rm empire_pg

# 데이터 볼륨과 함께 컨테이너 실행 (데이터 영속성)
docker run -d \
  --name empire_pg \
  --restart unless-stopped \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=your_secure_password \
  -e POSTGRES_DB=empire_lms \
  -p 5434:5432 \
  -v empire_pg_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

#### Docker 컨테이너 내부에서 PostgreSQL 접속

```bash
# 컨테이너 내부에서 psql 실행
docker exec -it empire_pg psql -U postgres -d empire_lms

# 또는 직접 SQL 실행
docker exec -it empire_pg psql -U postgres -d empire_lms -c "SELECT version();"
```

#### 데이터베이스 덤프/복구

```bash
# 덤프 생성
docker exec empire_pg pg_dump -U postgres empire_lms > backup.sql

# 덤프 복구
docker exec -i empire_pg psql -U postgres empire_lms < backup.sql

# 또는 볼륨 백업
docker run --rm \
  -v empire_pg_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/empire_pg_backup.tar.gz /data
```

### 옵션 2: 네이티브 PostgreSQL 설치

시스템에 직접 PostgreSQL을 설치합니다.

#### Ubuntu/Debian

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

#### macOS

```bash
brew install postgresql@16
brew services start postgresql@16
```

#### Windows

[PostgreSQL 공식 설치](https://www.postgresql.org/download/windows/) 다운로드 및 설치

### 데이터베이스 생성 (네이티브 PostgreSQL)

```bash
# PostgreSQL 접속
sudo -u postgres psql

# 데이터베이스와 사용자 생성
CREATE DATABASE empire_lms;
CREATE USER empire_lms_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE empire_lms TO empire_lms_user;
\q
```

### 마이그레이션 관리

```bash
# 새 마이그레이션 생성
npx prisma migrate dev --name add_new_feature

# 마이그레이션 히스토리 확인
npx prisma migrate status

# 프로덕션 환경에 마이그레이션 적용
npx prisma migrate deploy

# 데이터베이스 초기화 (개발용)
npx prisma migrate reset
```

### Prisma Studio (데이터베이스 GUI)

```bash
npx prisma studio
```

http://localhost:5555 에서 데이터베이스를 브라우저로 관리할 수 있습니다.

---

## 문제 해결

### 포트가 이미 사용 중인 경우

```bash
# 포트 3000 사용 중인 프로세스 확인
lsof -i :3000

# 또는
netstat -tlnp | grep :3000

# 프로세스 강제 종료
kill -9 <PID>
```

### 데이터베이스 연결 실패

#### Docker PostgreSQL

```bash
# 컨테이너 상태 확인
docker ps | grep empire_pg

# 컨테이너 로그 확인
docker logs empire_pg

# 컨테이너 내부에서 연결 테스트
docker exec -it empire_pg psql -U postgres -d empire_lms -c "SELECT 1;"

# 포트 확인
netstat -tlnp | grep 5434
# 또는
lsof -i :5434

# 연결 문자열 확인 (.env 파일의 포트가 5434인지 확인)
grep DATABASE_URL .env
```

#### 네이티브 PostgreSQL

```bash
# PostgreSQL 상태 확인
sudo systemctl status postgresql

# 데이터베이스 연결 테스트
psql -U empire_lms_user -d empire_lms -h localhost

# 연결 문자열 확인
echo $DATABASE_URL
```

#### 일반적인 연결 문제 해결

```bash
# Prisma를 통한 연결 테스트
cd /work/empire_lms
npx prisma db push

# 자세한 연결 로그 보기
DEBUG="prisma:query" npx prisma db push
```

### 의존성 문제

```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install

# Prisma 재생성
npx prisma generate
```

### 로그 확인

```bash
# 스크립트 로그
./empire_lms.sh logs

# PM2 로그 (PM2 사용 시)
pm2 logs empire-lms --lines 100
```

### 메모리 부족

```bash
# Node.js 메모리 제한 증가
export NODE_OPTIONS="--max-old-space-size=4096"
./empire_lms.sh start
```

### 권한 문제

```bash
# 스크립트 실행 권한 부여
chmod +x empire_lms.sh

# 로그 디렉토리 권한 확인
mkdir -p logs
chmod 755 logs
```

---

## 추가 리소스

- [Next.js 문서](https://nextjs.org/docs)
- [Prisma 문서](https://www.prisma.io/docs)
- [better-auth 문서](https://www.better-auth.com)
- [PM2 문서](https://pm2.keymetrics.io/docs)

---

## 도움말

문제가 발생하면:

1. `./empire_lms.sh status` 로 서비스 상태 확인
2. `./empire_lms.sh logs` 로 로그 확인
3. 위 문제 해결 섹션 참조
4. GitHub Issues 에 문제 보고
