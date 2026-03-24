#!/bin/bash

#############################################
# Empire LMS Service Management Script
# Usage: ./empire_lms.sh {start|stop|restart|status|logs}
#############################################

set -e

# Configuration
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="empire_lms"
DEV_PORT=3000
PROD_PORT=3000
PID_FILE="$PROJECT_DIR/.service.pid"
LOG_FILE="$PROJECT_DIR/logs/service.log"
ENV_FILE="$PROJECT_DIR/.env"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Ensure log directory exists
mkdir -p "$(dirname "$LOG_FILE")"

#############################################
# Helper Functions
#############################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

#############################################
# Prerequisites Check
#############################################

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi

    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        log_warning "PostgreSQL client not found. Make sure your database is running."
    fi

    # Check .env file
    if [ ! -f "$ENV_FILE" ]; then
        log_warning ".env file not found. Creating from .env.example..."
        if [ -f "$PROJECT_DIR/.env.example" ]; then
            cp "$PROJECT_DIR/.env.example" "$ENV_FILE"
            log_warning "Please edit $ENV_FILE with your configuration"
            exit 1
        else
            log_error ".env.example not found. Cannot create .env file."
            exit 1
        fi
    fi

    # Check node_modules
    if [ ! -d "$PROJECT_DIR/node_modules" ]; then
        log_warning "node_modules not found. Running npm install..."
        cd "$PROJECT_DIR"
        npm install
    fi

    log_success "Prerequisites check passed"
}

#############################################
# Database Operations
#############################################

check_database() {
    log_info "Checking database connection..."

    # Source environment variables
    if [ -f "$ENV_FILE" ]; then
        export $(grep -v '^#' "$ENV_FILE" | xargs)
    fi

    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        log_error "DATABASE_URL is not set in .env file"
        return 1
    fi

    # Run Prisma db push to ensure schema is up to date
    cd "$PROJECT_DIR"
    npx prisma generate > /dev/null 2>&1

    log_success "Database check passed"
}

#############################################
# Service Operations
#############################################

is_service_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

start_dev() {
    log_info "Starting Empire LMS in development mode..."

    check_prerequisites
    check_database

    if is_service_running; then
        log_warning "Service is already running (PID: $(cat $PID_FILE))"
        return 1
    fi

    cd "$PROJECT_DIR"

    # Start development server in background
    nohup npm run dev > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    # Wait for server to start
    sleep 3

    if is_service_running; then
        log_success "Development server started successfully"
        log_info "PID: $(cat $PID_FILE)"
        log_info "URL: http://localhost:$DEV_PORT"
        log_info "Logs: $LOG_FILE"
    else
        log_error "Failed to start development server. Check $LOG_FILE for details"
        return 1
    fi
}

start_prod() {
    log_info "Starting Empire LMS in production mode..."

    check_prerequisites
    check_database

    if is_service_running; then
        log_warning "Service is already running (PID: $(cat $PID_FILE))"
        return 1
    fi

    cd "$PROJECT_DIR"

    # Build the application
    log_info "Building application..."
    npm run build

    # Start production server in background
    nohup npm run start > "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"

    # Wait for server to start
    sleep 3

    if is_service_running; then
        log_success "Production server started successfully"
        log_info "PID: $(cat $PID_FILE)"
        log_info "URL: http://localhost:$PROD_PORT"
        log_info "Logs: $LOG_FILE"
    else
        log_error "Failed to start production server. Check $LOG_FILE for details"
        return 1
    fi
}

stop_service() {
    log_info "Stopping Empire LMS..."

    if ! is_service_running; then
        log_warning "Service is not running"
        return 0
    fi

    PID=$(cat "$PID_FILE")

    # Try graceful shutdown first
    log_info "Sending SIGTERM to process $PID..."
    kill "$PID" 2>/dev/null || true

    # Wait for process to terminate
    TIMEOUT=10
    ELAPSED=0
    while ps -p "$PID" > /dev/null 2>&1 && [ $ELAPSED -lt $TIMEOUT ]; do
        sleep 1
        ELAPSED=$((ELAPSED + 1))
    done

    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
        log_warning "Process did not terminate gracefully. Force killing..."
        kill -9 "$PID" 2>/dev/null || true
        sleep 1
    fi

    rm -f "$PID_FILE"
    log_success "Service stopped"
}

restart_dev() {
    stop_service
    sleep 2
    start_dev
}

restart_prod() {
    stop_service
    sleep 2
    start_prod
}

show_status() {
    echo ""
    echo "=========================================="
    echo "  Empire LMS Service Status"
    echo "=========================================="
    echo ""

    if is_service_running; then
        PID=$(cat "$PID_FILE")
        echo -e "Status: ${GREEN}Running${NC}"
        echo "PID: $PID"
        echo ""
        echo "Process Details:"
        ps -p "$PID" -o pid,ppid,cmd,etime,stat || true
        echo ""
        echo "Port Usage:"
        if command -v lsof &> /dev/null; then
            lsof -i ":$DEV_PORT" -i ":$PROD_PORT" 2>/dev/null || true
        elif command -v netstat &> /dev/null; then
            netstat -tlnp 2>/dev/null | grep -E ":($DEV_PORT|$PROD_PORT)" || true
        fi
        echo ""
        echo "Recent Logs:"
        echo "----------------------------------------"
        if [ -f "$LOG_FILE" ]; then
            tail -n 10 "$LOG_FILE"
        else
            echo "No log file found"
        fi
    else
        echo -e "Status: ${RED}Stopped${NC}"
        echo ""
        echo "Port Check:"
        if command -v lsof &> /dev/null; then
            if lsof -i ":$DEV_PORT" -i ":$PROD_PORT" > /dev/null 2>&1; then
                echo -e "${YELLOW}Warning: Port $DEV_PORT or $PROD_PORT is in use by another process${NC}"
                lsof -i ":$DEV_PORT" -i ":$PROD_PORT" 2>/dev/null || true
            else
                echo "Ports $DEV_PORT and $PROD_PORT are available"
            fi
        fi
    fi

    echo ""
    echo "=========================================="
}

show_logs() {
    if [ ! -f "$LOG_FILE" ]; then
        log_warning "Log file not found: $LOG_FILE"
        return 1
    fi

    if [ -n "$1" ]; then
        tail -n "$1" "$LOG_FILE"
    else
        tail -f "$LOG_FILE"
    fi
}

#############################################
# Main Script
#############################################

case "${1:-}" in
    start)
        case "${2:-dev}" in
            dev)
                start_dev
                ;;
            prod)
                start_prod
                ;;
            *)
                log_error "Unknown mode: $2"
                echo "Usage: $0 start {dev|prod}"
                exit 1
                ;;
        esac
        ;;
    stop)
        stop_service
        ;;
    restart)
        case "${2:-dev}" in
            dev)
                restart_dev
                ;;
            prod)
                restart_prod
                ;;
            *)
                log_error "Unknown mode: $2"
                echo "Usage: $0 restart {dev|prod}"
                exit 1
                ;;
        esac
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-}"
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status|logs} [dev|prod]"
        echo ""
        echo "Commands:"
        echo "  start [dev|prod]   - Start service (default: dev)"
        echo "  stop               - Stop service"
        echo "  restart [dev|prod] - Restart service (default: dev)"
        echo "  status             - Show service status"
        echo "  logs [n]           - Show logs (tail n lines, or follow if not specified)"
        echo ""
        echo "Examples:"
        echo "  $0 start           - Start in development mode"
        echo "  $0 start prod      - Start in production mode"
        echo "  $0 restart         - Restart in development mode"
        echo "  $0 status          - Show service status"
        echo "  $0 logs 50         - Show last 50 log lines"
        echo "  $0 logs            - Follow logs in real-time"
        exit 1
        ;;
esac
