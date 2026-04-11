# Server Diagram Source of Truth

**Version**: 1.0  
**Last Updated**: April 2026  
**Package**: `@studio/server`

---

## Overview

This document is the single source of truth for all server architecture diagrams, route structures, service relationships, and data flow patterns in AI Soul Studio's Express server.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Server Initialization](#server-initialization)
3. [Route Structure](#route-structure)
4. [Service Layer](#service-layer)
5. [Worker Architecture](#worker-architecture)
6. [Job Queue System](#job-queue-system)
7. [Data Flow Patterns](#data-flow-patterns)
8. [API Endpoints](#api-endpoints)
9. [Service Relationships](#service-relationships)
10. [File Structure](#file-structure)

---

## Architecture Overview

### High-Level Architecture

```mermaid
graph TB
    subgraph Entry["Server Entry"]
        ENV["env.ts (MUST BE FIRST)"]
        INDEX["index.ts"]
    end
    
    subgraph Express["Express Server"]
        APP["Express App"]
        CORS["CORS Middleware"]
        RATE["Rate Limiters"]
        BODY["Body Parser"]
        ROUTES["Modular Routes"]
        ERROR["Global Error Handler"]
    end
    
    subgraph Infrastructure["Infrastructure"]
        JOBQ["Job Queue"]
        WORKER["Worker Pool"]
        ENCODER["Encoder Detection"]
    end
    
    subgraph Routes["API Routes"]
        EXPORT["/api/export"]
        IMPORT["/api/import"]
        GEMINI["/api/gemini"]
        DEAPI["/api/deapi"]
        SUNO["/api/suno"]
        CLOUD["/api/cloud"]
        DIRECTOR["/api/director"]
        PROD["/api/production"]
        HEALTH["/api/health"]
    end
    
    subgraph Services["Services"]
        ENC["Encoding Service"]
        VALID["Validation Service"]
        STORE["Job Store"]
        TIMEOUT["Timeout Manager"]
    end
    
    ENV --> INDEX
    INDEX --> APP
    APP --> CORS
    CORS --> RATE
    RATE --> BODY
    BODY --> ROUTES
    ROUTES --> EXPORT
    ROUTES --> IMPORT
    ROUTES --> GEMINI
    ROUTES --> DEAPI
    ROUTES --> SUNO
    ROUTES --> CLOUD
    ROUTES --> DIRECTOR
    ROUTES --> PROD
    ROUTES --> HEALTH
    ROUTES --> ERROR
    
    INDEX --> ENCODER
    INDEX --> JOBQ
    INDEX --> WORKER
    JOBQ --> STORE
    JOBQ --> TIMEOUT
    WORKER --> JOBQ
    
    EXPORT --> ENC
    EXPORT --> VALID
    PROD --> JOBQ
    
    style INDEX fill:#16a34a,color:#fff
    style JOBQ fill:#ca8a04,color:#fff
    style WORKER fill:#2563eb,color:#fff
```

### Layer Responsibilities

| Layer | Responsibility | Location |
|-------|----------------|----------|
| **Entry** | Environment loading, server initialization | `env.ts`, `index.ts` |
| **Express** | HTTP server, middleware, routing | `index.ts` |
| **Routes** | API endpoint handlers | `routes/` |
| **Infrastructure** | Job queue, worker pool, encoder detection | `services/`, `workers/` |
| **Services** | Encoding, validation, job persistence | `services/` |
| **Shared** | Business logic, AI services (from shared package) | `@studio/shared` |

---

## Server Initialization

### Initialization Flow

```mermaid
graph TD
    START["Server Start"]
    ENV_LOAD["Load Environment<br/>(.env, .env.local)"]
    ENV_ASSERT["Assert Required Env Vars"]
    APP_INIT["Initialize Express App"]
    DIR_ENSURE["Ensure Directories<br/>(temp, jobs)"]
    CORS_CONFIG["Configure CORS"]
    RATE_CONFIG["Configure Rate Limiters"]
    BODY_CONFIG["Configure Body Parser"]
    ROUTE_REG["Register Routes"]
    ENCODER_DETECT["Detect Encoders"]
    WORKER_INIT["Initialize Worker Pool"]
    JOBQ_INIT["Initialize Job Queue"]
    DEAPI_WARM["Warm DeAPI Registry"]
    LISTEN["Listen on PORT"]
    SHUTDOWN_HOOK["Register Shutdown Hooks"]
    
    START --> ENV_LOAD
    ENV_LOAD --> ENV_ASSERT
    ENV_ASSERT --> APP_INIT
    APP_INIT --> DIR_ENSURE
    DIR_ENSURE --> CORS_CONFIG
    CORS_CONFIG --> RATE_CONFIG
    RATE_CONFIG --> BODY_CONFIG
    BODY_CONFIG --> ROUTE_REG
    ROUTE_REG --> ENCODER_DETECT
    ENCODER_DETECT --> WORKER_INIT
    WORKER_INIT --> JOBQ_INIT
    JOBQ_INIT --> DEAPI_WARM
    DEAPI_WARM --> LISTEN
    LISTEN --> SHUTDOWN_HOOK
    
    style START fill:#16a34a,color:#fff
    style LISTEN fill:#ca8a04,color:#fff
```

### Environment Loading

```mermaid
graph LR
    ROOT["Workspace Root"]
    ENV["env.ts"]
    DOT_ENV[".env"]
    DOT_ENV_LOCAL[".env.local"]
    PROCESS["process.env"]
    
    ROOT --> ENV
    ENV --> DOT_ENV
    ENV --> DOT_ENV_LOCAL
    DOT_ENV --> PROCESS
    DOT_ENV_LOCAL --> PROCESS
    
    style ENV fill:#ca8a04,color:#fff
```

**Critical**: `env.ts` MUST be imported FIRST in `index.ts` before any other modules that use environment variables.

### Shutdown Flow

```mermaid
graph TD
    SIG["SIGTERM/SIGINT"]
    LOG["Log Shutdown"]
    JOBQ_SHUTDOWN["Shutdown Job Queue"]
    WORKER_SHUTDOWN["Shutdown Worker Pool"]
    EXIT["Process Exit"]
    
    SIG --> LOG
    LOG --> JOBQ_SHUTDOWN
    JOBQ_SHUTDOWN --> WORKER_SHUTDOWN
    WORKER_SHUTDOWN --> EXIT
    
    style SIG fill:#ef4444,color:#fff
```

---

## Route Structure

### Route Configuration

```mermaid
graph TD
    APP["Express App"]
    
    subgraph RateLimiters["Rate Limiters"]
        API["apiLimiter<br/>(120/min)"]
        EXPORT["exportLimiter<br/>(10/hour)"]
        GEMINI["geminiLimiter<br/>(60/min)"]
        PROD["productionLimiter<br/>(5/hour)"]
        DEAPI["deapiLimiter<br/>(20/hour)"]
    end
    
    subgraph Routes["Routes"]
        EXPORT_R["/api/export"]
        IMPORT_R["/api/import"]
        HEALTH_R["/api/health"]
        GEMINI_R["/api/gemini"]
        DEAPI_R["/api/deapi"]
        SUNO_R["/api/suno"]
        CLOUD_R["/api/cloud"]
        DIRECTOR_R["/api/director"]
        PROD_R["/api/production"]
    end
    
    APP --> API
    API --> EXPORT
    EXPORT --> EXPORT_R
    
    APP --> API
    API --> IMPORT_R
    
    APP --> HEALTH_R
    
    APP --> API
    API --> GEMINI
    GEMINI --> GEMINI_R
    
    APP --> API
    API --> DEAPI
    DEAPI --> DEAPI_R
    
    APP --> API
    API --> SUNO_R
    
    APP --> API
    API --> CLOUD_R
    
    APP --> API
    API --> DIRECTOR_R
    
    APP --> API
    API --> PROD
    PROD --> PROD_R
    
    style APP fill:#16a34a,color:#fff
    style API fill:#ca8a04,color:#fff
```

### Route Definitions

| Route | Rate Limit | Purpose | Handler |
|-------|------------|---------|---------|
| `/api/export` | 120/min, 10/hour | Video export | `routes/export.ts` |
| `/api/import` | 120/min | Project import | `routes/import.ts` |
| `/api/health` | None | Health check | `routes/health.ts` |
| `/api/gemini` | 120/min, 60/min | Gemini AI proxy | `routes/gemini.ts` |
| `/api/deapi` | 120/min, 20/hour | DeAPI model access | `routes/deapi.ts` |
| `/api/suno` | 120/min | Suno music generation | `routes/suno.ts` |
| `/api/cloud` | 120/min | Cloud services | `routes/cloud.ts` |
| `/api/director` | 120/min | Director agent | `routes/director.ts` |
| `/api/production` | 120/min, 5/hour | Video production | `routes/production.ts` |

### Route Middleware Stack

```mermaid
graph LR
    REQ["Request"]
    CORS["CORS"]
    API_LIMIT["apiLimiter"]
    SPECIFIC["Specific Limiter"]
    BODY["Body Parser"]
    ROUTE["Route Handler"]
    RES["Response"]
    ERROR["Error Handler"]
    
    REQ --> CORS
    CORS --> API_LIMIT
    API_LIMIT --> SPECIFIC
    SPECIFIC --> BODY
    BODY --> ROUTE
    ROUTE --> RES
    ROUTE --> ERROR
    
    style REQ fill:#2563eb,color:#fff
    style RES fill:#16a34a,color:#fff
```

---

## Service Layer

### Service Architecture

```mermaid
graph TD
    subgraph Services["Services"]
        JOBQ["Job Queue Manager"]
        STORE["Job Store"]
        TIMEOUT["Timeout Manager"]
        ENCODER["Encoder Strategy"]
        VALID["Validation Service"]
        FRAME_VAL["Frame Validator"]
        QUAL_VER["Quality Verifier"]
    end
    
    subgraph Routes["Routes"]
        EXPORT["export.ts"]
        PROD["production.ts"]
    end
    
    JOBQ --> STORE
    JOBQ --> TIMEOUT
    EXPORT --> JOBQ
    EXPORT --> ENCODER
    EXPORT --> VALID
    VALID --> FRAME_VAL
    VALID --> QUAL_VER
    PROD --> JOBQ
    
    style JOBQ fill:#ca8a04,color:#fff
    style ENCODER fill:#2563eb,color:#fff
```

### Service Responsibilities

| Service | Responsibility | Used By |
|---------|----------------|---------|
| `JobQueueManager` | Job lifecycle, queue management, SSE subscriptions | export route, production route |
| `JobStore` | Job persistence to disk | JobQueueManager |
| `TimeoutManager` | Stall detection, timeout monitoring | JobQueueManager |
| `EncoderStrategy` | Encoder detection, selection, argument generation | export route |
| `FrameValidator` | Frame validation, size checking | export route |
| `QualityVerifier` | Output quality verification | export route |

---

## Worker Architecture

### Worker Pool Architecture

```mermaid
graph TD
    subgraph WorkerPool["Worker Pool"]
        POOL["WorkerPool"]
        WORKERS["Worker Processes"]
        PENDING["Pending Jobs Queue"]
    end
    
    subgraph Worker["Worker Process"]
        WORKER["ffmpegWorker.ts"]
        FFmpeg["FFmpeg CLI"]
        STDOUT["Stdout Handler"]
        STDERR["Stderr Handler"]
        IPC["IPC Channel"]
    end
    
    subgraph Messages["Message Types"]
        START["START_JOB"]
        CANCEL["CANCEL_JOB"]
        SHUTDOWN["SHUTDOWN"]
        PROGRESS["PROGRESS"]
        COMPLETE["COMPLETE"]
        ERROR["ERROR"]
        HEARTBEAT["HEARTBEAT"]
        MEMORY["MEMORY_WARNING"]
    end
    
    POOL --> WORKERS
    POOL --> PENDING
    WORKERS --> WORKER
    WORKER --> FFmpeg
    WORKER --> STDOUT
    WORKER --> STDERR
    WORKER --> IPC
    
    POOL -->|"send"| START
    POOL -->|"send"| CANCEL
    POOL -->|"send"| SHUTDOWN
    WORKER -->|"emit"| PROGRESS
    WORKER -->|"emit"| COMPLETE
    WORKER -->|"emit"| ERROR
    WORKER -->|"emit"| HEARTBEAT
    WORKER -->|"emit"| MEMORY
    
    style POOL fill:#2563eb,color:#fff
    style WORKER fill:#ca8a04,color:#fff
```

### Worker Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Spawning: Pool Initialize
    Spawning --> Idle: Worker Created
    Idle --> Busy: Job Submitted
    Busy --> Idle: Job Complete
    Busy --> Error: Job Failed
    Error --> Idle: Restart
    Idle --> ShuttingDown: Shutdown Signal
    Busy --> ShuttingDown: Shutdown Signal
    ShuttingDown --> [*]: Process Exit
```

### Worker Configuration

| Configuration | Value | Description |
|--------------|-------|-------------|
| `MAX_WORKERS` | 4 | Maximum concurrent worker processes |
| `WORKER_MEMORY_LIMIT_MB` | 8192 | 8GB memory limit per worker |
| `WORKER_RESTART_DELAY_MS` | 1000 | Delay before restarting failed worker |

### Worker Message Flow

```mermaid
sequenceDiagram
    participant Main as Main Process
    participant Pool as Worker Pool
    participant Worker as Worker Process
    participant FFmpeg as FFmpeg
    
    Main->>Pool: submitJob(job)
    Pool->>Worker: START_JOB message
    Worker->>FFmpeg: Spawn FFmpeg process
    Worker->>Pool: STARTED message
    FFmpeg->>Worker: Progress output
    Worker->>Pool: PROGRESS message
    FFmpeg->>Worker: Complete
    Worker->>Pool: COMPLETE message
    Pool->>Main: Job complete callback
```

---

## Job Queue System

### Job Queue Architecture

```mermaid
graph TD
    subgraph JobQueue["Job Queue Manager"]
        QUEUE["JobQueueManager"]
        JOBS["In-Memory Jobs Map"]
        SUBS["SSE Subscribers"]
        PROC_QUEUE["Processing Queue"]
        ACTIVE["Active Jobs Set"]
    end
    
    subgraph Components["Components"]
        STORE["Job Store"]
        TIMEOUT["Timeout Manager"]
        PROCESSOR["Job Processor"]
    end
    
    subgraph States["Job States"]
        PENDING["pending"]
        UPLOADING["uploading"]
        QUEUED["queued"]
        ENCODING["encoding"]
        COMPLETE["complete"]
        FAILED["failed"]
    end
    
    QUEUE --> JOBS
    QUEUE --> SUBS
    QUEUE --> PROC_QUEUE
    QUEUE --> ACTIVE
    QUEUE --> STORE
    QUEUE --> TIMEOUT
    QUEUE --> PROCESSOR
    
    PENDING --> UPLOADING
    UPLOADING --> QUEUED
    QUEUED --> ENCODING
    ENCODING --> COMPLETE
    ENCODING --> FAILED
    QUEUED --> FAILED
    FAILED --> QUEUED
    
    style QUEUE fill:#ca8a04,color:#fff
    style STORE fill:#2563eb,color:#fff
```

### Job Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: createJob()
    Pending --> Uploading: Frames uploaded
    Uploading --> Queued: queueJob()
    Queued --> Encoding: Worker available
    Encoding --> Complete: Success
    Encoding --> Failed: Error
    Failed --> Queued: Retry (if under limit)
    Failed --> [*]: Max retries exceeded
    Complete --> [*]: Cleanup after retention
```

### Job Queue Flow

```mermaid
graph TD
    CLIENT["Client"]
    ROUTE["Export Route"]
    QUEUE["Job Queue"]
    STORE["Job Store"]
    WORKER["Worker Pool"]
    TIMEOUT["Timeout Manager"]
    SUB["SSE Subscriber"]
    
    CLIENT -->|"POST /init"| ROUTE
    ROUTE -->|"createJob"| QUEUE
    QUEUE -->|"saveJob"| STORE
    QUEUE -->|"subscribe"| SUB
    SUB -->|"SSE stream"| CLIENT
    
    CLIENT -->|"POST /frames"| ROUTE
    ROUTE -->|"registerFrames"| QUEUE
    QUEUE -->|"queueJob"| QUEUE
    QUEUE -->|"updateStatus: queued"| STORE
    
    QUEUE -->|"processJob"| WORKER
    WORKER -->|"updateStatus: encoding"| QUEUE
    WORKER -->|"updateProgress"| QUEUE
    QUEUE -->|"emit progress"| SUB
    TIMEOUT -->|"heartbeat"| QUEUE
    TIMEOUT -->|"timeout"| QUEUE
    
    WORKER -->|"complete"| QUEUE
    QUEUE -->|"updateStatus: complete"| STORE
    QUEUE -->|"emit complete"| SUB
    
    style QUEUE fill:#ca8a04,color:#fff
    style WORKER fill:#2563eb,color:#fff
```

### Job Recovery

```mermaid
graph TD
    START["Server Start"]
    LOAD["Load Incomplete Jobs"]
    CHECK["Check Session Directory"]
    CHECK2["Check Frames Exist"]
    RESET["Reset to Queued"]
    MARK["Mark as Failed"]
    QUEUE["Add to Processing Queue"]
    PROCESS["Process Recovered Jobs"]
    
    START --> LOAD
    LOAD --> CHECK
    CHECK -->|"missing"| MARK
    CHECK -->|"exists"| CHECK2
    CHECK2 -->|"missing"| MARK
    CHECK2 -->|"exists"| RESET
    RESET --> QUEUE
    QUEUE --> PROCESS
    MARK --> PROCESS
    
    style START fill:#16a34a,color:#fff
```

---

## Data Flow Patterns

### Pattern 1: Video Export Flow

```mermaid
sequenceDiagram
    participant Client as Client
    participant Route as Export Route
    participant Queue as Job Queue
    participant Store as Job Store
    participant Worker as Worker Pool
    participant FFmpeg as FFmpeg Worker
    participant Sub as SSE Subscriber
    
    Client->>Route: POST /api/export/init (audio)
    Route->>Queue: createJob(sessionId)
    Queue->>Store: saveJob()
    Queue-->>Route: job
    Route-->>Client: jobId, sessionId
    
    Client->>Route: POST /api/export/frames (frames)
    Route->>Queue: registerFrames(jobId, count)
    Queue->>Store: saveJob()
    Route-->>Client: Frame received
    
    Client->>Route: POST /api/export/queue
    Route->>Queue: queueJob(jobId)
    Queue->>Store: saveJob()
    Queue->>Queue: processNextJob()
    
    Queue->>Worker: submitJob(job)
    Worker->>FFmpeg: START_JOB
    FFmpeg-->>Worker: STARTED
    Worker-->>Queue: STARTED
    Queue->>Queue: updateStatus(encoding)
    Queue->>Sub: emit progress
    
    FFmpeg->>Worker: PROGRESS
    Worker-->>Queue: PROGRESS
    Queue->>Sub: emit progress
    
    FFmpeg->>Worker: COMPLETE
    Worker-->>Queue: COMPLETE
    Queue->>Store: saveJob()
    Queue->>Sub: emit complete
```

### Pattern 2: AI Generation Flow

```mermaid
sequenceDiagram
    participant Client as Client
    participant Route as Gemini Route
    participant API as ProxyAIClient
    participant Server as Express Server
    participant AI as Gemini API
    
    Client->>Route: POST /api/gemini
    Route->>API: callProxy(endpoint, data)
    API->>Server: fetch('/api/gemini', options)
    Server->>AI: Vertex AI / Direct API
    AI-->>Server: Response
    Server-->>API: Response
    API-->>Route: Response
    Route-->>Client: JSON response
```

### Pattern 3: SSE Progress Streaming

```mermaid
sequenceDiagram
    participant Client as Client
    participant Route as Export Route
    participant Queue as Job Queue
    participant Sub as SSE Subscriber
    participant Worker as Worker Pool
    
    Client->>Route: GET /api/export/progress/:jobId
    Route->>Queue: subscribe(jobId, callback)
    Queue-->>Route: unsubscribe function
    Route->>Client: SSE headers
    Route->>Sub: Send initial state
    
    Worker->>Queue: PROGRESS message
    Queue->>Sub: emit progress
    Sub->>Client: SSE data: progress update
    
    Worker->>Queue: COMPLETE message
    Queue->>Sub: emit complete
    Sub->>Client: SSE data: complete
    Sub->>Client: SSE close
    Queue->>Queue: unsubscribe
```

---

## API Endpoints

### Export Endpoints

```mermaid
graph TD
    subgraph Export["/api/export"]
        INIT["POST /init<br/>Initialize session"]
        FRAMES["POST /frames<br/>Upload frames"]
        QUEUE["POST /queue<br/>Queue for encoding"]
        PROGRESS["GET /progress/:jobId<br/>SSE progress stream"]
        STATUS["GET /status/:jobId<br/>Get job status"]
        DOWNLOAD["GET /download/:jobId<br/>Download output"]
        CANCEL["POST /cancel/:jobId<br/>Cancel job"]
    end
    
    subgraph Flow["Export Flow"]
        F1["1. Init"]
        F2["2. Upload Frames"]
        F3["3. Queue"]
        F4["4. Monitor Progress"]
        F5["5. Download"]
    end
    
    F1 --> INIT
    F2 --> FRAMES
    F3 --> QUEUE
    F4 --> PROGRESS
    F5 --> DOWNLOAD
    
    style Export fill:#2563eb,color:#fff
```

### Export Endpoint Details

| Endpoint | Method | Auth | Rate Limit | Purpose |
|----------|--------|------|------------|---------|
| `/api/export/init` | POST | Optional | 10/hour | Initialize export session |
| `/api/export/frames` | POST | Optional | 10/hour | Upload frame images |
| `/api/export/queue` | POST | Optional | 10/hour | Queue job for encoding |
| `/api/export/progress/:jobId` | GET | Optional | None | SSE progress stream |
| `/api/export/status/:jobId` | GET | Optional | None | Get job status |
| `/api/export/download/:jobId` | GET | Optional | None | Download output video |
| `/api/export/cancel/:jobId` | POST | Optional | None | Cancel job |

### AI Service Endpoints

```mermaid
graph TD
    subgraph Gemini["/api/gemini"]
        GEN["POST /generate<br/>Generate content"]
        CHAT["POST /chat<br/>Chat completion"]
        STREAM["POST /stream<br/>Stream response"]
    end
    
    subgraph DeAPI["/api/deapi"]
        MODELS["GET /models<br/>List models"]
        GEN2["POST /generate<br/>Generate media"]
        WEBHOOK["POST /webhook<br/>Webhook handler"]
    end
    
    subgraph Suno["/api/suno"]
        GEN_MUSIC["POST /generate<br/>Generate music"]
        STATUS["GET /status/:id<br/>Get status"]
    end
    
    subgraph Director["/api/director"]
        DIRECT["POST /direct<br/>Director agent"]
    end
    
    subgraph Production["/api/production"]
        START["POST /start<br/>Start production"]
        CHECKPOINT["POST /checkpoint<br/>Checkpoint response"]
        STATUS2["GET /status/:id<br/>Get status"]
    end
    
    style Gemini fill:#ca8a04,color:#fff
    style DeAPI fill:#9333ea,color:#fff
    style Suno fill:#16a34a,color:#fff
```

### AI Endpoint Details

| Route | Endpoint | Method | Rate Limit | Purpose |
|-------|----------|--------|------------|---------|
| `/api/gemini` | `/generate` | POST | 60/min | Generate content |
| `/api/gemini` | `/chat` | POST | 60/min | Chat completion |
| `/api/gemini` | `/stream` | POST | 60/min | Stream response |
| `/api/deapi` | `/models` | GET | 20/hour | List models |
| `/api/deapi` | `/generate` | POST | 20/hour | Generate media |
| `/api/deapi` | `/webhook` | POST | 20/hour | Webhook handler |
| `/api/suno` | `/generate` | POST | 120/min | Generate music |
| `/api/suno` | `/status/:id` | GET | 120/min | Get status |
| `/api/director` | `/direct` | POST | 120/min | Director agent |
| `/api/production` | `/start` | POST | 5/hour | Start production |
| `/api/production` | `/checkpoint` | POST | 5/hour | Checkpoint response |
| `/api/production` | `/status/:id` | GET | 5/hour | Get status |

---

## Service Relationships

### Export Route Dependencies

```mermaid
graph TD
    EXPORT["export.ts"]
    
    subgraph Dependencies["Dependencies"]
        UTILS["utils/index"]
        JOBQ["jobQueue"]
        ENCODER["encoderStrategy"]
        VALID["validation/frameValidator"]
        QUAL["validation/qualityVerifier"]
        TYPES["types/renderJob"]
        SHARED["@studio/shared"]
    end
    
    subgraph Utils["Utils Functions"]
        SANITIZE["sanitizeId"]
        SESSION["getSessionDir"]
        CLEANUP["cleanupSession"]
        GEN_ID["generateJobId"]
    end
    
    subgraph Encoding["Encoding Functions"]
        DETECT["detectEncoders"]
        SELECT["getSelectedEncoder"]
        INFO["getEncoderInfo"]
        ARGS["getEncoderArgs"]
    end
    
    subgraph Validation["Validation Functions"]
        VALID_SESSION["validateSessionFrames"]
        VALID_SIZES["validateFrameSizes"]
        VERIFY["verifyOutputQuality"]
        QUICK["quickValidate"]
    end
    
    EXPORT --> UTILS
    EXPORT --> JOBQ
    EXPORT --> ENCODER
    EXPORT --> VALID
    EXPORT --> TYPES
    EXPORT --> SHARED
    
    UTILS --> SANITIZE
    UTILS --> SESSION
    UTILS --> CLEANUP
    UTILS --> GEN_ID
    
    ENCODER --> DETECT
    ENCODER --> SELECT
    ENCODER --> INFO
    ENCODER --> ARGS
    
    VALID --> VALID_SESSION
    VALID --> VALID_SIZES
    VALID --> VERIFY
    VALID --> QUICK
    
    style EXPORT fill:#2563eb,color:#fff
    style JOBQ fill:#ca8a04,color:#fff
```

### Job Queue Dependencies

```mermaid
graph TD
    JOBQ["jobQueue/index"]
    
    subgraph Dependencies["Dependencies"]
        STORE["jobStore"]
        TIMEOUT["timeoutManager"]
        UTILS["utils/index"]
        TYPES["types/renderJob"]
        SHARED["@studio/shared"]
    end
    
    subgraph StoreFunctions["Job Store Functions"]
        SAVE["saveJob"]
        LOAD["loadJob"]
        DELETE["deleteJob"]
        LOAD_INC["loadIncompleteJobs"]
        CLEANUP["cleanupOldJobs"]
    end
    
    subgraph TimeoutFunctions["Timeout Functions"]
        START["start"]
        STOP["stop"]
        TRACK["trackJob"]
        UNTRACK["untrackJob"]
        RECORD["recordHeartbeat"]
    end
    
    JOBQ --> STORE
    JOBQ --> TIMEOUT
    JOBQ --> UTILS
    JOBQ --> TYPES
    JOBQ --> SHARED
    
    STORE --> SAVE
    STORE --> LOAD
    STORE --> DELETE
    STORE --> LOAD_INC
    STORE --> CLEANUP
    
    TIMEOUT --> START
    TIMEOUT --> STOP
    TIMEOUT --> TRACK
    TIMEOUT --> UNTRACK
    TIMEOUT --> RECORD
    
    style JOBQ fill:#ca8a04,color:#fff
    style STORE fill:#2563eb,color:#fff
```

### Worker Pool Dependencies

```mermaid
graph TD
    POOL["workerPool"]
    
    subgraph Dependencies["Dependencies"]
        TYPES["types/renderJob"]
        SHARED["@studio/shared"]
    end
    
    subgraph Worker["Worker Process"]
        FFMPEG["ffmpegWorker"]
        FLUENT["fluent-ffmpeg"]
        FS["fs"]
        PATH["path"]
    end
    
    POOL --> TYPES
    POOL --> SHARED
    POOL --> FFMPEG
    
    FFMPEG --> FLUENT
    FFMPEG --> FS
    FFMPEG --> PATH
    
    style POOL fill:#2563eb,color:#fff
    style FFMPEG fill:#ca8a04,color:#fff
```

---

## File Structure

### Server Package Structure

```
packages/server/
├── env.ts                          # Environment loader (MUST BE FIRST)
├── index.ts                        # Server entry point
├── types.ts                        # Server-specific types
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
│
├── routes/                         # API route handlers
│   ├── export.ts                   # Video export endpoints
│   ├── import.ts                   # Project import endpoints
│   ├── health.ts                   # Health check
│   ├── gemini.ts                   # Gemini AI proxy
│   ├── deapi.ts                    # DeAPI integration
│   ├── suno.ts                     # Suno music generation
│   ├── cloud.ts                    # Cloud services
│   ├── director.ts                 # Director agent
│   ├── production.ts               # Video production
│   └── routeUtils.ts               # Route utilities
│
├── services/                       # Server services
│   ├── encoding/                   # Encoding strategy
│   │   └── encoderStrategy.ts
│   ├── jobQueue/                   # Job queue management
│   │   ├── index.ts                # Job queue manager
│   │   ├── jobStore.ts             # Job persistence
│   │   └── timeoutManager.ts       # Timeout monitoring
│   └── validation/                 # Validation services
│       ├── frameValidator.ts       # Frame validation
│       └── qualityVerifier.ts      # Quality verification
│
├── workers/                        # Worker processes
│   ├── workerPool.ts               # Worker pool manager
│   └── ffmpegWorker.ts            # FFmpeg worker
│
├── middleware/                     # Express middleware
│   └── auth.ts                     # Authentication middleware
│
├── utils/                          # Utility functions
│   ├── index.ts                    # Main utilities
│   └── response.ts                 # Response utilities
│
└── types/                          # Type definitions
    └── renderJob.ts                # Render job types
```

---

## Key Patterns

### Pattern 1: Rate Limiting Strategy

```mermaid
graph TD
    REQ["Request"]
    API["apiLimiter (120/min)"]
    SPECIFIC["Specific Limiter"]
    ROUTE["Route Handler"]
    
    REQ --> API
    API -->|"pass"| SPECIFIC
    API -->|"block"| ERR["Rate Limit Error"]
    SPECIFIC -->|"pass"| ROUTE
    SPECIFIC -->|"block"| ERR2["Specific Limit Error"]
    
    style API fill:#ca8a04,color:#fff
    style SPECIFIC fill:#2563eb,color:#fff
```

**Purpose**: Protect API from abuse with tiered rate limiting.

### Pattern 2: Job Queue with Workers

```mermaid
graph TD
    QUEUE["Job Queue"]
    PROC["Processing Queue"]
    ACTIVE["Active Jobs"]
    POOL["Worker Pool"]
    WORKER["Worker Process"]
    
    QUEUE -->|"queueJob"| PROC
    PROC -->|"processNextJob"| ACTIVE
    ACTIVE -->|"submitJob"| POOL
    POOL -->|"assign"| WORKER
    WORKER -->|"complete"| POOL
    POOL -->|"next"| ACTIVE
    
    style QUEUE fill:#ca8a04,color:#fff
    style POOL fill:#2563eb,color:#fff
```

**Purpose**: Manage concurrent video encoding with worker isolation.

### Pattern 3: SSE Progress Streaming

```mermaid
graph LR
    CLIENT["Client"]
    ROUTE["Route"]
    QUEUE["Job Queue"]
    SUB["Subscriber"]
    WORKER["Worker"]
    
    CLIENT -->|"GET /progress"| ROUTE
    ROUTE -->|"subscribe"| QUEUE
    QUEUE -->|"callback"| SUB
    SUB -->|"SSE"| CLIENT
    
    WORKER -->|"progress"| QUEUE
    QUEUE -->|"emit"| SUB
    SUB -->|"data"| CLIENT
    
    style QUEUE fill:#ca8a04,color:#fff
```

**Purpose**: Real-time progress updates without polling.

### Pattern 4: Job Persistence and Recovery

```mermaid
graph TD
    JOB["Job"]
    STORE["Job Store"]
    DISK["Disk (temp/jobs/)"]
    RESTART["Server Restart"]
    RECOVER["Recover Jobs"]
    QUEUE["Re-queue"]
    
    JOB -->|"save"| STORE
    STORE -->|"write"| DISK
    RESTART --> RECOVER
    RECOVER -->|"load"| STORE
    STORE -->|"read"| DISK
    RECOVER --> QUEUE
    
    style STORE fill:#2563eb,color:#fff
```

**Purpose**: Survive server restarts with job recovery.

---

## Performance Considerations

### Worker Pool Optimization

```mermaid
graph TD
    subgraph Pool["Worker Pool"]
        MAX["MAX_WORKERS = 4"]
        MEM["8GB per worker"]
        PRESPAWN["Pre-spawn 1 worker"]
        QUEUE["Pending job queue"]
    end
    
    subgraph Optimization["Optimizations"]
        ISOLATION["Process isolation"]
        MEM_LIMIT["Memory limits"]
        RESTART["Auto-restart on failure"]
        QUEUE_M["Job queuing"]
    end
    
    Pool --> Optimization
    
    style Pool fill:#16a34a,color:#fff
```

### Job Queue Optimization

```mermaid
graph TD
    subgraph Queue["Job Queue"]
        MAX_CONCURRENT["MAX_CONCURRENT_JOBS = 4"]
        RETENTION["30 min retention"]
        CLEANUP["Hourly cleanup"]
        TIMEOUT["60s stall, 30min timeout"]
    end
    
    subgraph Optimization["Optimizations"]
        IN_MEMORY["In-memory job map"]
        PERSIST["Selective persistence"]
        SUBSCRIBE["SSE subscribers"]
        RECOVERY["Job recovery"]
    end
    
    Queue --> Optimization
    
    style Queue fill:#ca8a04,color:#fff
```

### Rate Limiting Strategy

```mermaid
graph LR
    API["API Limiter<br/>120/min"]
    GEMINI["Gemini Limiter<br/>60/min"]
    PROD["Production Limiter<br/>5/hour"]
    EXPORT["Export Limiter<br/>10/hour"]
    DEAPI["DeAPI Limiter<br/>20/hour"]
    
    style API fill:#ca8a04,color:#fff
    style PROD fill:#ef4444,color:#fff
```

---

## Security Considerations

### Security Architecture

```mermaid
graph TD
    subgraph Security["Security Layers"]
        CORS["CORS Policy"]
        RATE["Rate Limiting"]
        AUTH["Auth Middleware"]
        VALID["Input Validation"]
        SANITIZE["ID Sanitization"]
    end
    
    subgraph Data["Data Protection"]
        ENV["Environment Variables"]
        SECRET["API Secrets"]
        TEMP["Temp File Cleanup"]
    end
    
    subgraph Network["Network Security"]
        ORIGINS["Allowed Origins"]
        LOCAL["Localhost Only"]
        PROD["Production Origins"]
    end
    
    Security --> Data
    Security --> Network
    
    style CORS fill:#16a34a,color:#fff
    style AUTH fill:#ca8a04,color:#fff
```

### Security Measures

1. **CORS**: Configurable allowed origins
2. **Rate Limiting**: Tiered rate limiting per route
3. **Authentication**: Optional auth middleware
4. **Input Validation**: Frame validation, size limits
5. **Sanitization**: Session ID sanitization
6. **Secrets**: Environment variable protection
7. **Cleanup**: Automatic temp file cleanup

---

## Error Handling

### Error Handling Strategy

```mermaid
graph TD
    ERROR["Error"]
    CATCH["Try-Catch Block"]
    LOG["Logger"]
    RES["Response"]
    QUEUE["Job Queue"]
    RETRY["Retry Logic"]
    
    ERROR --> CATCH
    CATCH --> LOG
    CATCH --> RES
    CATCH --> QUEUE
    QUEUE --> RETRY
    
    style ERROR fill:#ef4444,color:#fff
```

### Error Types

| Error Type | Handling | Retry |
|------------|----------|-------|
| Validation Error | Return 400 with details | No |
| Rate Limit Error | Return 429 with retry-after | No |
| Worker Error | Mark job failed, retry if under limit | Yes |
| Timeout Error | Mark job failed, retry if under limit | Yes |
| API Error | Return 500 with error message | No |
| File System Error | Log error, return 500 | No |

---

## Monitoring and Observability

### Logging Architecture

```mermaid
graph TD
    subgraph Logging["Logging"]
        LOGGER["createLogger"]
        CONSOLE["Console Output"]
        FILE["File Output (optional)"]
    end
    
    subgraph Loggers["Loggers"]
        SERVER["Server"]
        EXPORT["Export"]
        FFmpeg["FFmpeg"]
        WORKER["Worker"]
        JOBQ["Job Queue"]
    end
    
    LOGGER --> CONSOLE
    LOGGER --> FILE
    SERVER --> LOGGER
    EXPORT --> LOGGER
    FFmpeg --> LOGGER
    WORKER --> LOGGER
    JOBQ --> LOGGER
    
    style LOGGER fill:#ca8a04,color:#fff
```

### Metrics Available

- **Job Queue Stats**: Total, pending, uploading, queued, encoding, complete, failed
- **Worker Pool Stats**: Total workers, active workers, idle workers, pending jobs, unhealthy workers
- **Job Progress**: Progress percentage, current frame, total frames
- **Timing**: Started at, completed at, duration

---

## Maintenance Guidelines

### Adding New Routes

1. Create route file in `routes/`
2. Add route to `index.ts` with appropriate rate limiter
3. Add route to `routes.ts` config (if needed)
4. Add authentication if required
5. Add error handling
6. Add logging
7. Update this document

### Adding New Services

1. Create service file in `services/`
2. Follow existing service patterns
3. Add TypeScript types
4. Add error handling
5. Add logging
6. Add tests
7. Update service relationships diagram

### Modifying Worker Behavior

1. Update `ffmpegWorker.ts` for worker logic
2. Update `workerPool.ts` for pool management
3. Update message types in `types/renderJob.ts`
4. Test worker lifecycle
5. Test error handling
6. Update worker architecture diagram

### Modifying Job Queue

1. Update `jobQueue/index.ts` for queue logic
2. Update `jobStore.ts` for persistence
3. Update `timeoutManager.ts` for timeout logic
4. Test job recovery
5. Test SSE subscriptions
6. Update job queue diagram

---

## Resources

### Documentation

- **Frontend Diagram Source of Truth**: `docs/FRONTEND_DIAGRAM_SOURCE_OF_TRUTH.md`
- **Visual Source of Truth**: `docs/VISUAL_SOURCE_OF_TRUTH.md`
- **Architecture**: `docs/ARCHITECTURE.md`
- **AGENTS.md**: Project-wide agents documentation

### External Documentation

- **Express**: https://expressjs.com
- **Multer**: https://github.com/expressjs/multer
- **fluent-ffmpeg**: https://github.com/fluent-ffmpeg/node-fluent-ffmpeg
- **FFmpeg**: https://ffmpeg.org

---

## Changelog

### Version 1.0 (April 2026)
- Initial Server Diagram Source of Truth documentation
- Complete architecture overview
- Server initialization flow
- Route structure with rate limiting
- Service layer documentation
- Worker architecture with message flow
- Job queue system with lifecycle
- Data flow patterns (export, AI, SSE)
- API endpoints documentation
- Service relationships
- File structure
- Key patterns
- Performance considerations
- Security considerations
- Error handling strategy
- Monitoring and observability
- Maintenance guidelines

---

**This document is the single source of truth for all server architecture diagrams and structural relationships in AI Soul Studio. All architectural changes should be documented here first.**
